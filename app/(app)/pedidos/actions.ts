"use server";

import { revalidatePath } from "next/cache";
import { type ActionResult, dbError, parseInput } from "@/lib/actions";
import { loadSheets } from "@/lib/catalog";
import { CHANNEL_PRICING_COLUMNS, channelFees, evaluateSheet } from "@/lib/cost-sheet";
import { itemCostFields, itemSheet, sheetUnitCosts, storedItemCost } from "@/lib/item-cost";
import {
  BOARD_STATUSES,
  type BoardStatus,
  dueDateFromToday,
  failureCost,
  itemPrintMinutes,
  machineCostPerHour,
  type PaymentKind,
  plannedPayments,
  refundAmount,
} from "@/lib/orders";
import { formatCurrency } from "@/lib/format";
import { PAYMENT_RATE_COLUMNS, paymentFee, paymentRates } from "@/lib/payment-fees";
import { profitAtPrice } from "@/lib/pricing";
import { loadPricingContext } from "@/lib/pricing-context";
import { type DiscountType, quoteTotals } from "@/lib/quotes";
import type { Json } from "@/lib/supabase/database.types";
import { createClient } from "@/lib/supabase/server";
import {
  consumeSchema,
  failureSchema,
  manualOrderSchema,
  markPaymentSchema,
  orderDetailsSchema,
  orderItemCostSchema,
} from "@/lib/validation/schemas";

type Supabase = Awaited<ReturnType<typeof createClient>>;
type DbError = { code?: string; message: string };

const MESSAGES: Record<string, string> = {
  quote_not_approved: "Só orçamento aprovado vira pedido.",
  quote_already_converted: "Este orçamento já virou pedido.",
  already_consumed: "O filamento deste pedido já foi baixado.",
  order_cancelled: "Pedido cancelado.",
  already_cancelled: "Este pedido já foi cancelado.",
  order_not_found: "Pedido não encontrado.",
  order_number_mismatch: "O número digitado não confere com o do pedido.",
};

function orderError(error: DbError): string {
  const code = Object.keys(MESSAGES).find((c) => error.message.includes(c));
  return code ? MESSAGES[code] : dbError(error);
}

function revalidateOrders(id?: string) {
  revalidatePath("/pedidos");
  if (id) revalidatePath(`/pedidos/${id}`);
  revalidatePath("/filamentos", "layout");
  revalidatePath("/clientes", "layout");
  revalidatePath("/orcamentos", "layout");
  revalidatePath("/financeiro");
  revalidatePath("/dashboard");
}

/** Custo por peça (agora) e tempo de impressão de cada item, pela ficha do banco. */
async function itemsFromSheets(
  supabase: Supabase,
  items: { variantId: string | null; costSheetId: string | null; quantity: number }[],
) {
  const variantIds = items.flatMap((i) => (i.variantId ? [i.variantId] : []));
  const { data: variants } = variantIds.length
    ? await supabase.from("product_variants").select("id, cost_sheet_id").in("id", variantIds)
    : { data: [] };
  const variantSheet = new Map((variants ?? []).map((v) => [v.id, v.cost_sheet_id]));
  const [ctx, sheets] = await Promise.all([loadPricingContext(supabase), loadSheets(supabase)]);
  const sheetMap = new Map(sheets.map((s) => [s.id, s.sheet]));

  return {
    ctx,
    rows: items.map((i) => {
      const sheetId = i.variantId ? (variantSheet.get(i.variantId) ?? null) : i.costSheetId;
      const sheet = sheetId ? sheetMap.get(sheetId) : undefined;
      const evaluation = sheet ? evaluateSheet(sheet, ctx) : null;
      // hora de trabalho do custo por peça, com o mesmo acréscimo da margem de falha (DRE "sem a sua hora")
      const costs = evaluation?.ok ? sheetUnitCosts(evaluation.result, ctx.settings.failure_margin_pct) : null;
      return {
        costSheetId: sheetId,
        unitCost: costs?.unitCost ?? null,
        unitLaborCost: costs?.unitLaborCost ?? null,
        printMinutes: itemPrintMinutes(sheet ?? null, i.quantity),
      };
    }),
  };
}

/** Orçamento aprovado → pedido em "Aguardando pagamento", com sinal/restante se o orçamento tiver sinal. */
export async function createOrderFromQuote(quoteId: string): Promise<ActionResult<{ id: string }>> {
  const supabase = await createClient();
  const [{ data: q }, { data: direct }] = await Promise.all([
    supabase.from("quotes").select("*, quote_items(*)").eq("id", quoteId).maybeSingle(),
    supabase.from("sales_channels").select("id").eq("kind", "direct").limit(1).maybeSingle(),
  ]);
  if (!q) return { ok: false, error: "Orçamento não encontrado." };

  const items = [...q.quote_items].sort((a, b) => a.sort_order - b.sort_order);
  const totals = quoteTotals({
    items: items.map((i) => ({ quantity: i.quantity, unitPrice: i.unit_price })),
    discountType: q.discount_type as DiscountType,
    discountValue: q.discount_value,
    shippingCost: q.shipping_cost,
    depositPct: q.deposit_pct,
  });
  const { rows } = await itemsFromSheets(
    supabase,
    items.map((i) => ({ variantId: null, costSheetId: i.cost_sheet_id, quantity: i.quantity })),
  );
  const { data, error } = await supabase.rpc("create_order", {
    p_order: {
      quoteId,
      customerId: q.customer_id,
      channelId: direct?.id ?? null,
      status: "awaiting_payment",
      dueDate: q.production_days !== null ? dueDateFromToday(q.production_days) : null,
      shippingCost: totals.shipping,
      discountAmount: totals.discount,
      totalAmount: totals.total,
      // Venda direta: a taxa entra em cada pagamento, pela forma usada (set_order_payment)
      channelFees: 0,
      notes: q.notes,
      items: items.map((i, idx) => {
        // item avulso com custo da mini calculadora ou manual: vai como está no orçamento
        const own = storedItemCost(i.cost_source, i.cost_input);
        return {
          variantId: i.variant_id,
          costSheetId: i.cost_sheet_id,
          description: i.description,
          quantity: i.quantity,
          unitPrice: i.unit_price,
          // custo da época do orçamento; sem ele, o custo de hoje da ficha
          unitCost: i.unit_cost ?? rows[idx].unitCost,
          unitLaborCost: own ? i.unit_labor_cost : rows[idx].unitLaborCost,
          printMinutes: rows[idx].printMinutes ?? itemPrintMinutes(itemSheet(own, i.quantity), i.quantity),
          costSource: own ? i.cost_source : null,
          costInput: own ? i.cost_input : null,
        };
      }),
      payments: plannedPayments(totals.total, totals.deposit),
    },
  });
  if (error) return { ok: false, error: orderError(error) };
  revalidateOrders(data);
  return { ok: true, message: "Pedido criado.", data: { id: data } };
}

/** Venda da Shopee/TikTok (paga pela plataforma, entra na fila) ou venda direta sem orçamento. */
export async function createManualOrder(input: unknown): Promise<ActionResult<{ id: string }>> {
  const parsed = parseInput(manualOrderSchema, input);
  if (!parsed.ok) return parsed;
  const o = parsed.data;
  const supabase = await createClient();
  const { data: channel } = await supabase
    .from("sales_channels")
    .select(CHANNEL_PRICING_COLUMNS)
    .eq("id", o.channelId)
    .maybeSingle();
  if (!channel) return { ok: false, error: "Canal não encontrado." };

  const platform = channel.kind === "shopee" || channel.kind === "tiktok";
  const subtotal = o.items.reduce((s, i) => s + i.quantity * i.unitPrice, 0);
  const total = Math.round((subtotal + o.shippingCost) * 100) / 100;
  const { rows, ctx } = await itemsFromSheets(supabase, o.items);
  const itemCosts: (Extract<ReturnType<typeof itemCostFields>, { ok: true }> | null)[] = [];
  for (const [idx, i] of o.items.entries()) {
    const fields = !i.variantId && !i.costSheetId ? itemCostFields(i.cost, i.quantity, ctx) : null;
    if (fields && !fields.ok) return { ok: false, error: `Item ${idx + 1} (${i.description}): ${fields.message}` };
    itemCosts.push(fields);
  }
  // Venda direta: a taxa entra em cada pagamento; plataformas e outros canais, a taxa do pedido
  const fees = channel.kind === "direct" ? 0 : profitAtPrice(total, 0, channelFees(channel), 0).channelFees;

  const { data, error } = await supabase.rpc("create_order", {
    p_order: {
      customerId: o.customerId,
      channelId: channel.id,
      platformOrderNumber: o.platformOrderNumber,
      status: platform ? "queued" : "awaiting_payment",
      dueDate: o.dueDate,
      shippingCost: o.shippingCost,
      discountAmount: 0,
      totalAmount: total,
      channelFees: Math.round(fees * 100) / 100,
      paidByPlatform: platform,
      notes: o.notes,
      items: o.items.map((i, idx) => {
        const own = itemCosts[idx];
        return {
          variantId: i.variantId,
          costSheetId: rows[idx].costSheetId,
          description: i.description,
          quantity: i.quantity,
          unitPrice: i.unitPrice,
          unitCost: own ? own.unitCost : rows[idx].unitCost,
          unitLaborCost: own ? own.unitLaborCost : rows[idx].unitLaborCost,
          printMinutes: rows[idx].printMinutes ?? itemPrintMinutes(itemSheet(i.cost, i.quantity), i.quantity),
          costSource: own?.costSource ?? null,
          costInput: own?.costInput ?? null,
        };
      }),
      payments: platform ? [] : plannedPayments(total, null),
    },
  });
  if (error) return { ok: false, error: orderError(error) };
  revalidateOrders(data);
  return { ok: true, message: platform ? "Pedido criado na fila." : "Pedido criado.", data: { id: data } };
}

/** Muda de coluna e/ou reordena a coluna de destino (ids na ordem nova). */
export async function moveOrder(orderId: string, status: BoardStatus, columnOrder: string[]): Promise<ActionResult> {
  if (!BOARD_STATUSES.includes(status)) return { ok: false, error: "Coluna inválida." };
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("orders")
    .update({ status, board_position: Math.max(columnOrder.indexOf(orderId), 0) })
    .eq("id", orderId)
    .neq("status", "cancelled")
    .select("id");
  if (error) return { ok: false, error: dbError(error) };
  if (data.length === 0) return { ok: false, error: "Pedido cancelado ou não encontrado." };
  // posições dos outros cards da coluna
  await Promise.all(
    columnOrder
      .map((id, position) => ({ id, position }))
      .filter(({ id }) => id !== orderId)
      .map(({ id, position }) => supabase.from("orders").update({ board_position: position }).eq("id", id)),
  );
  revalidateOrders(orderId);
  return { ok: true };
}

export async function consumeFilament(input: unknown): Promise<ActionResult> {
  const parsed = parseInput(consumeSchema, input);
  if (!parsed.ok) return parsed;
  const { orderId, skip, lines } = parsed.data;
  const supabase = await createClient();
  const { error } = await supabase.rpc("consume_order_filament", {
    p_order_id: orderId,
    p_lines: lines.filter((l) => l.grams > 0),
    p_skip: skip,
  });
  if (error) return { ok: false, error: orderError(error) };
  revalidateOrders(orderId);
  return { ok: true, message: skip ? "Movido sem baixa de filamento." : "Filamento baixado do estoque." };
}

export async function markPayment(input: unknown): Promise<ActionResult> {
  const parsed = parseInput(markPaymentSchema, input);
  if (!parsed.ok) return parsed;
  const { orderId, kind, paidOn, method } = parsed.data;
  const supabase = await createClient();
  const { data: payment } = await supabase
    .from("order_payments")
    .select(`amount, orders(sales_channels(kind, ${PAYMENT_RATE_COLUMNS}))`)
    .eq("order_id", orderId)
    .eq("kind", kind)
    .maybeSingle();
  if (!payment) return { ok: false, error: "Pagamento não encontrado." };

  // taxa calculada aqui, pela forma usada e pelas taxas atuais da Venda direta (não confia no navegador)
  const channel = payment.orders?.sales_channels;
  const fee = channel?.kind === "direct" ? paymentFee(payment.amount, method, paymentRates(channel)) : null;
  const { error } = await supabase.rpc("set_order_payment", {
    p_order_id: orderId,
    p_kind: kind,
    p_paid_on: paidOn,
    p_method: method,
    // a função aceita null (pagamento de outro canal); o gerador de tipos não marca argumento como opcional
    p_fee: fee as number,
  });
  if (error) return { ok: false, error: error.message.includes("payment_not_found") ? "Pagamento não encontrado." : dbError(error) };
  revalidateOrders(orderId);
  return { ok: true, message: kind === "deposit" ? "Sinal pago." : kind === "balance" ? "Restante pago." : "Pagamento registrado." };
}

export async function unmarkPayment(orderId: string, kind: "deposit" | "balance" | "full"): Promise<ActionResult> {
  const supabase = await createClient();
  // desmarcar tira a taxa do pagamento e refaz a taxa do pedido (Venda direta)
  const { error } = await supabase.rpc("set_order_payment", {
    p_order_id: orderId,
    p_kind: kind,
    p_paid_on: null as unknown as string,
    p_method: null as unknown as string,
    p_fee: null as unknown as number,
  });
  if (error) return { ok: false, error: dbError(error) };
  revalidateOrders(orderId);
  return { ok: true, message: "Pagamento desfeito." };
}

/**
 * "Definir custo" de um item avulso de um pedido existente (qualquer status, inclusive Entregue e Cancelado).
 * Só muda o custo e a mão de obra do item (set_order_item_cost); preço, pagamentos e taxas ficam como estão.
 */
export async function setOrderItemCost(input: unknown): Promise<ActionResult> {
  const parsed = parseInput(orderItemCostSchema, input);
  if (!parsed.ok) return parsed;
  const { itemId, cost } = parsed.data;
  const supabase = await createClient();
  const { data: item } = await supabase
    .from("order_items")
    .select("order_id, quantity, variant_id")
    .eq("id", itemId)
    .maybeSingle();
  if (!item || item.variant_id) return { ok: false, error: "Item avulso não encontrado." };

  const fields = itemCostFields(cost, item.quantity, await loadPricingContext(supabase));
  if (!fields.ok) return { ok: false, error: fields.message };
  // a função aceita null (remover o custo); o gerador de tipos não marca argumento como opcional
  const { error } = await supabase.rpc("set_order_item_cost", {
    p_item_id: itemId,
    p_unit_cost: fields.unitCost as number,
    p_unit_labor_cost: fields.unitLaborCost as number,
    p_cost_source: fields.costSource as string,
    p_cost_input: fields.costInput as Json,
  });
  if (error) {
    if (error.message.includes("item_not_found")) return { ok: false, error: "Item avulso não encontrado." };
    if (error.message.includes("invalid_")) return { ok: false, error: "Custo inválido." };
    return { ok: false, error: dbError(error) };
  }
  revalidateOrders(item.order_id);
  return { ok: true, message: cost ? "Custo do item salvo." : "Custo do item removido." };
}

/** Falha: o custo (filamento + máquina) é calculado aqui, com os valores atuais. */
export async function recordFailure(input: unknown): Promise<ActionResult> {
  const parsed = parseInput(failureSchema, input);
  if (!parsed.ok) return parsed;
  const f = parsed.data;
  const supabase = await createClient();
  const ctx = await loadPricingContext(supabase);
  const spool = f.filamentId ? ctx.spools.find((s) => s.id === f.filamentId) : undefined;
  const cost = failureCost({
    grams: f.grams,
    costPerGram: spool?.cost_per_gram ?? null,
    minutes: f.minutes,
    machinePerHour: machineCostPerHour(ctx),
  });
  const { error } = await supabase.rpc("record_print_failure", {
    p_order_id: f.orderId,
    p_failure: { filamentId: f.filamentId, grams: f.grams, minutes: f.minutes, cost, reason: f.reason },
  });
  if (error) return { ok: false, error: orderError(error) };
  revalidateOrders(f.orderId);
  return { ok: true, message: "Falha registrada." };
}

/** Cancelar; com `refund`, o que o cliente pagou vira um Estorno de hoje no Financeiro (valor calculado aqui). */
export async function cancelOrder(orderId: string, printed: boolean, refund: boolean): Promise<ActionResult> {
  const supabase = await createClient();
  let amount = 0;
  if (refund) {
    const { data: o } = await supabase
      .from("orders")
      .select("total_amount, channel_fees, paid_by_platform, order_payments(kind, amount, paid_on)")
      .eq("id", orderId)
      .maybeSingle();
    if (!o) return { ok: false, error: MESSAGES.order_not_found };
    amount = refundAmount({
      paidByPlatform: o.paid_by_platform,
      total: o.total_amount,
      channelFees: o.channel_fees,
      payments: o.order_payments.map((p) => ({ kind: p.kind as PaymentKind, amount: p.amount, paidOn: p.paid_on })),
    });
  }
  const { error } = await supabase.rpc("cancel_order", { p_order_id: orderId, p_printed: printed, p_refund: amount });
  if (error) return { ok: false, error: orderError(error) };
  revalidateOrders(orderId);
  const parts = ["Pedido cancelado."];
  if (amount > 0) parts.push(`Estorno de ${formatCurrency(amount)} lançado.`);
  return { ok: true, message: parts.join(" ") };
}

/** Exclui o pedido como se nunca tivesse existido; `number` é o número digitado na confirmação. */
export async function deleteOrder(orderId: string, number: string): Promise<ActionResult> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("delete_order", { p_order_id: orderId, p_number: number });
  if (error) return { ok: false, error: orderError(error) };
  revalidateOrders();
  return { ok: true, message: "Pedido excluído." };
}

export async function updateOrderDetails(input: unknown): Promise<ActionResult> {
  const parsed = parseInput(orderDetailsSchema, input);
  if (!parsed.ok) return parsed;
  const { orderId, trackingCode, dueDate, notes } = parsed.data;
  const supabase = await createClient();
  const { error } = await supabase.from("orders").update({ tracking_code: trackingCode, due_date: dueDate, notes }).eq("id", orderId);
  if (error) return { ok: false, error: dbError(error) };
  revalidateOrders(orderId);
  return { ok: true, message: "Pedido atualizado." };
}
