"use server";

import { revalidatePath } from "next/cache";
import { type ActionResult, dbError, parseInput } from "@/lib/actions";
import { loadSheets } from "@/lib/catalog";
import { evaluateSheet } from "@/lib/cost-sheet";
import { itemCostFields } from "@/lib/item-cost";
import { loadPricingContext } from "@/lib/pricing-context";
import { defaultValidUntil } from "@/lib/quotes";
import { createClient } from "@/lib/supabase/server";
import { quoteSchema } from "@/lib/validation/schemas";

type DbError = { code?: string; message: string };

function quoteError(error: DbError): string {
  if (error.message.includes("quote_locked")) return "Orçamento aprovado ou recusado não muda. Use “Duplicar”.";
  if (error.message.includes("quote_not_found")) return "Orçamento não encontrado.";
  return dbError(error);
}

function revalidateQuotes(id?: string) {
  revalidatePath("/orcamentos");
  if (id) revalidatePath(`/orcamentos/${id}`);
  revalidatePath("/clientes", "layout");
}

type Supabase = Awaited<ReturnType<typeof createClient>>;

/** Custo por peça de cada ficha, agora (fica guardado no item: é o custo da época do orçamento). */
async function sheetCosts(supabase: Supabase, sheetIds: string[]): Promise<Map<string, number>> {
  const costs = new Map<string, number>();
  if (sheetIds.length === 0) return costs;
  const [ctx, sheets] = await Promise.all([loadPricingContext(supabase), loadSheets(supabase)]);
  for (const s of sheets) {
    if (!sheetIds.includes(s.id)) continue;
    const evaluation = evaluateSheet(s.sheet, ctx);
    if (evaluation.ok) costs.set(s.id, Math.round(evaluation.result.unit.total * 10_000) / 10_000);
  }
  return costs;
}

export async function saveQuote(input: unknown): Promise<ActionResult<{ id: string }>> {
  const parsed = parseInput(quoteSchema, input);
  if (!parsed.ok) return parsed;
  const q = parsed.data;
  const supabase = await createClient();

  // a ficha de um item do catálogo vem da variação no banco, não do navegador
  const variantIds = q.items.flatMap((i) => (i.variantId ? [i.variantId] : []));
  const { data: variants } = variantIds.length
    ? await supabase.from("product_variants").select("id, cost_sheet_id").in("id", variantIds)
    : { data: [] };
  const variantSheet = new Map((variants ?? []).map((v) => [v.id, v.cost_sheet_id]));
  const items = q.items.map((i) => ({
    ...i,
    costSheetId: i.variantId ? (variantSheet.get(i.variantId) ?? null) : i.costSheetId,
  }));
  const costs = await sheetCosts(
    supabase,
    items.flatMap((i) => (i.costSheetId ? [i.costSheetId] : [])),
  );

  // item avulso: custo da mini calculadora (recalculado aqui, com os carretéis do banco) ou manual
  const avulsos = items.some((i) => !i.variantId && !i.costSheetId && i.cost);
  const ctx = avulsos ? await loadPricingContext(supabase) : null;
  const itemCosts: (Extract<ReturnType<typeof itemCostFields>, { ok: true }> | null)[] = [];
  for (const [idx, i] of items.entries()) {
    const fields = ctx && !i.variantId && !i.costSheetId ? itemCostFields(i.cost, i.quantity, ctx) : null;
    if (fields && !fields.ok) return { ok: false, error: `Item ${idx + 1} (${i.description}): ${fields.message}` };
    itemCosts.push(fields);
  }

  const { data, error } = await supabase.rpc("save_quote", {
    p_quote: {
      id: q.id,
      customerId: q.customerMode === "existing" ? q.customerId : null,
      newCustomer: q.customerMode === "new" ? { name: q.newCustomerName, whatsapp: q.newCustomerWhatsapp } : null,
      discountType: q.discountType,
      discountValue: q.discountValue,
      shippingCost: q.shippingCost,
      productionDays: q.productionDays,
      validUntil: q.validUntil,
      depositPct: q.depositPct,
      paymentTerms: q.paymentTerms,
      notes: q.notes,
      items: items.map((i, idx) => {
        const own = itemCosts[idx];
        return {
          variantId: i.variantId,
          costSheetId: i.costSheetId,
          description: i.description,
          quantity: i.quantity,
          unitPrice: i.unitPrice,
          unitCost: i.costSheetId ? (costs.get(i.costSheetId) ?? null) : (own?.unitCost ?? null),
          unitLaborCost: own?.unitLaborCost ?? null,
          costSource: own?.costSource ?? null,
          costInput: own?.costInput ?? null,
        };
      }),
    },
  });
  if (error) return { ok: false, error: quoteError(error) };

  revalidateQuotes(data);
  return { ok: true, message: q.id ? "Orçamento atualizado." : "Orçamento criado.", data: { id: data } };
}

/** Rascunho vira enviado (ao mandar pelo WhatsApp ou copiar o link). Enviado continua enviado. */
export async function markQuoteSent(id: string): Promise<ActionResult> {
  const supabase = await createClient();
  const { error } = await supabase
    .from("quotes")
    .update({ status: "sent", sent_at: new Date().toISOString() })
    .eq("id", id)
    .eq("status", "draft");
  if (error) return { ok: false, error: dbError(error) };
  revalidateQuotes(id);
  return { ok: true };
}

/** Aprovar ou recusar pelo painel (ex.: o cliente respondeu pelo WhatsApp). */
export async function setQuoteOutcome(id: string, outcome: "approved" | "rejected"): Promise<ActionResult> {
  const supabase = await createClient();
  const now = new Date().toISOString();
  const { data, error } = await supabase
    .from("quotes")
    .update(outcome === "approved" ? { status: outcome, approved_at: now } : { status: outcome, rejected_at: now })
    .eq("id", id)
    .in("status", ["draft", "sent"])
    .select("id");
  if (error) return { ok: false, error: dbError(error) };
  if (data.length === 0) return { ok: false, error: "Este orçamento já foi aprovado ou recusado." };
  revalidateQuotes(id);
  return { ok: true, message: outcome === "approved" ? "Orçamento aprovado." : "Orçamento recusado." };
}

/** Cópia em rascunho, com validade nova e os preços do original. */
export async function duplicateQuote(id: string): Promise<ActionResult<{ id: string }>> {
  const supabase = await createClient();
  const [{ data: q }, { data: settings }] = await Promise.all([
    supabase.from("quotes").select("*, quote_items(*)").eq("id", id).maybeSingle(),
    supabase.from("settings").select("quote_validity_days").single(),
  ]);
  if (!q) return { ok: false, error: "Orçamento não encontrado." };

  const { data, error } = await supabase.rpc("save_quote", {
    p_quote: {
      customerId: q.customer_id,
      discountType: q.discount_type,
      discountValue: q.discount_value,
      shippingCost: q.shipping_cost,
      productionDays: q.production_days,
      validUntil: defaultValidUntil(settings?.quote_validity_days ?? 7),
      depositPct: q.deposit_pct,
      paymentTerms: q.payment_terms,
      notes: q.notes,
      items: [...q.quote_items]
        .sort((a, b) => a.sort_order - b.sort_order)
        .map((i) => ({
          variantId: i.variant_id,
          costSheetId: i.cost_sheet_id,
          description: i.description,
          imagePath: i.image_path,
          quantity: i.quantity,
          unitPrice: i.unit_price,
          unitCost: i.unit_cost,
          unitLaborCost: i.unit_labor_cost,
          costSource: i.cost_source,
          costInput: i.cost_input,
        })),
    },
  });
  if (error) return { ok: false, error: quoteError(error) };
  revalidateQuotes();
  return { ok: true, message: "Cópia criada em rascunho.", data: { id: data } };
}

export async function deleteQuote(id: string): Promise<ActionResult> {
  const supabase = await createClient();
  const { error } = await supabase.from("quotes").delete().eq("id", id);
  if (error) return { ok: false, error: dbError(error) };
  revalidateQuotes();
  return { ok: true, message: "Orçamento excluído." };
}
