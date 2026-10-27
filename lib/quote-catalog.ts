import "server-only";
import { type CatalogSheet, loadSheets } from "@/lib/catalog";
import { type PricingContext, channelFees, evaluateSheet } from "@/lib/cost-sheet";
import { type ChannelFees, suggestPrice } from "@/lib/pricing";
import { loadPricingContext } from "@/lib/pricing-context";
import type { createClient } from "@/lib/supabase/server";

type Supabase = Awaited<ReturnType<typeof createClient>>;

/** Item que o orçamento pode puxar: uma variação do catálogo ou uma ficha da calculadora. */
export type QuoteCatalogOption = {
  kind: "variant" | "sheet";
  id: string;
  /** "Suporte de controle · Xbox" ou o nome da ficha. */
  label: string;
  /** Preço padrão: o da variação na venda direta; senão o sugerido para esse canal. */
  price: number | null;
  /** Custo por peça hoje (privado). */
  cost: number | null;
};

export type QuoteCatalog = {
  options: QuoteCatalogOption[];
  /** Taxas da venda direta (Pix/maquininha) para o lucro do orçamento. */
  directFees: ChannelFees;
  taxPct: number;
};

function costOf(sheet: CatalogSheet | undefined, ctx: PricingContext): number | null {
  if (!sheet) return null;
  const evaluation = evaluateSheet(sheet.sheet, ctx);
  return evaluation.ok ? evaluation.result.unit.total : null;
}

export async function loadQuoteCatalog(supabase: Supabase): Promise<QuoteCatalog> {
  const [ctx, sheets, { data: products }] = await Promise.all([
    loadPricingContext(supabase),
    loadSheets(supabase),
    supabase
      .from("products")
      .select("name, product_variants(id, name, active, sort_order, cost_sheet_id, variant_channel_prices(channel_id, price))")
      .eq("active", true)
      .order("name"),
  ]);

  const direct = ctx.channels.find((c) => c.kind === "direct");
  const directFees: ChannelFees = direct ? channelFees(direct) : { commissionPct: null, extraPct: null, fixedFee: null };
  const { tax_pct, default_margin_pct, rounding_rule } = ctx.settings;
  const suggested = (cost: number | null) => {
    if (cost === null) return null;
    const s = suggestPrice(cost, directFees, tax_pct, default_margin_pct, rounding_rule);
    return s.ok ? s.price : null;
  };
  const sheetById = new Map(sheets.map((s) => [s.id, s]));

  const variantOptions = (products ?? []).flatMap((p) =>
    [...p.product_variants]
      .filter((v) => v.active)
      .sort((a, b) => a.sort_order - b.sort_order)
      .map((v): QuoteCatalogOption => {
        const cost = costOf(v.cost_sheet_id ? sheetById.get(v.cost_sheet_id) : undefined, ctx);
        const directPrice = direct ? v.variant_channel_prices.find((x) => x.channel_id === direct.id)?.price : undefined;
        return {
          kind: "variant",
          id: v.id,
          label: p.product_variants.length > 1 || v.name !== "Padrão" ? `${p.name} · ${v.name}` : p.name,
          price: directPrice ?? suggested(cost),
          cost,
        };
      }),
  );

  const sheetOptions = sheets.map((s): QuoteCatalogOption => {
    const cost = costOf(s, ctx);
    return { kind: "sheet", id: s.id, label: s.name, price: suggested(cost), cost };
  });

  return { options: [...variantOptions, ...sheetOptions], directFees, taxPct: tax_pct };
}
