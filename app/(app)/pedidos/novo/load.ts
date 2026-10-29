import "server-only";
import { loadSheets } from "@/lib/catalog";
import { channelFees, evaluateSheet } from "@/lib/cost-sheet";
import { suggestPrice } from "@/lib/pricing";
import { loadPricingContext } from "@/lib/pricing-context";
import type { createClient } from "@/lib/supabase/server";

type Supabase = Awaited<ReturnType<typeof createClient>>;

export type OrderCatalogOption = {
  kind: "variant" | "sheet";
  id: string;
  label: string;
  /** Preço padrão por canal: o cadastrado na variação; senão o sugerido para o canal. */
  prices: Record<string, number | null>;
};

export type OrderChannel = {
  id: string;
  name: string;
  kind: string;
  commissionPct: number | null;
  extraPct: number | null;
  fixedFee: number | null;
};

export async function loadManualOrderData(supabase: Supabase) {
  const [ctx, sheets, { data: products }, { data: customers }] = await Promise.all([
    loadPricingContext(supabase),
    loadSheets(supabase),
    supabase
      .from("products")
      .select("name, product_variants(id, name, active, sort_order, cost_sheet_id, variant_channel_prices(channel_id, price))")
      .eq("active", true)
      .order("name"),
    supabase.from("customers").select("id, name").order("name"),
  ]);
  const { tax_pct, default_margin_pct, rounding_rule } = ctx.settings;
  const sheetById = new Map(sheets.map((s) => [s.id, s.sheet]));

  const costOf = (sheetId: string | null) => {
    const sheet = sheetId ? sheetById.get(sheetId) : undefined;
    if (!sheet) return null;
    const evaluation = evaluateSheet(sheet, ctx);
    return evaluation.ok ? evaluation.result.unit.total : null;
  };
  const suggestedFor = (cost: number | null) =>
    Object.fromEntries(
      ctx.channels.map((c) => {
        if (cost === null) return [c.id, null];
        const s = suggestPrice(cost, channelFees(c), tax_pct, default_margin_pct, rounding_rule);
        return [c.id, s.ok ? s.price : null];
      }),
    ) as Record<string, number | null>;

  const options: OrderCatalogOption[] = [
    ...(products ?? []).flatMap((p) =>
      [...p.product_variants]
        .filter((v) => v.active)
        .sort((a, b) => a.sort_order - b.sort_order)
        .map((v): OrderCatalogOption => {
          const suggested = suggestedFor(costOf(v.cost_sheet_id));
          const stored = new Map(v.variant_channel_prices.map((x) => [x.channel_id, x.price]));
          return {
            kind: "variant",
            id: v.id,
            label: p.product_variants.length > 1 || v.name !== "Padrão" ? `${p.name} · ${v.name}` : p.name,
            prices: Object.fromEntries(ctx.channels.map((c) => [c.id, stored.get(c.id) ?? suggested[c.id]])),
          };
        }),
    ),
    ...sheets.map((s): OrderCatalogOption => ({ kind: "sheet", id: s.id, label: s.name, prices: suggestedFor(costOf(s.id)) })),
  ];

  // Venda direta: taxas do Pix (padrão); a taxa real entra em cada pagamento, pela forma usada
  const channels: OrderChannel[] = ctx.channels.map((c) => ({ id: c.id, name: c.name, kind: c.kind, ...channelFees(c) }));

  return { options, channels, customers: customers ?? [] };
}
