import "server-only";
import { loadSheets } from "@/lib/catalog";
import { priceVariant, summarizeProduct } from "@/lib/product-pricing";
import { loadPricingContext } from "@/lib/pricing-context";
import type { createClient } from "@/lib/supabase/server";

type Supabase = Awaited<ReturnType<typeof createClient>>;

/** Produtos com o resumo de margem recalculado agora (preços dos carretéis e taxas atuais). */
export async function loadProductSummaries(supabase: Supabase) {
  const [ctx, sheets, { data: products, error }] = await Promise.all([
    loadPricingContext(supabase),
    loadSheets(supabase),
    supabase
      .from("products")
      .select(
        "id, name, sku, image_path, active, product_variants(id, name, sku, active, sort_order, cost_sheet_id, variant_channel_prices(channel_id, price))",
      )
      .order("name"),
  ]);
  if (error) throw new Error("Não foi possível carregar os produtos.");

  const sheetById = new Map(sheets.map((s) => [s.id, s.sheet]));
  return products.map((p) => {
    const active = p.product_variants.filter((v) => v.active);
    const summary = summarizeProduct(
      active.map((v) =>
        priceVariant(
          (v.cost_sheet_id && sheetById.get(v.cost_sheet_id)) || null,
          Object.fromEntries(v.variant_channel_prices.map((x) => [x.channel_id, x.price])),
          ctx,
        ),
      ),
    );
    return { ...p, summary };
  });
}
