import "server-only";
import { type SheetData, sheetFromRow } from "@/lib/cost-sheet";
import type { SheetUsage } from "@/lib/products";
import type { createClient } from "@/lib/supabase/server";

type Supabase = Awaited<ReturnType<typeof createClient>>;

export type CatalogSheet = { id: string; name: string; sheet: SheetData };

// string única (sem concatenar): o supabase-js infere o tipo das linhas a partir dela
const SHEET_COLUMNS =
  "id, name, printer_id, print_minutes, prep_minutes, post_minutes, purge_g, packaging_cost, quantity, pieces_per_plate, cost_sheet_filaments(filament_id, material, color_hex, grams, sort_order, spool_removed), cost_sheet_supplies(supply_id, name, quantity, unit_cost)";

/** Todas as fichas do usuário, prontas para o cálculo (lib/product-pricing.ts). */
export async function loadSheets(supabase: Supabase): Promise<CatalogSheet[]> {
  const { data, error } = await supabase.from("cost_sheets").select(SHEET_COLUMNS).order("name");
  if (error) throw new Error("Não foi possível carregar as fichas de custo.");
  return data.map((s) => ({ id: s.id, name: s.name, sheet: sheetFromRow(s) }));
}

/** Variações que usam cada ficha (chave = id da ficha). */
export async function loadSheetUsage(supabase: Supabase): Promise<Map<string, SheetUsage[]>> {
  const { data, error } = await supabase
    .from("product_variants")
    .select("name, cost_sheet_id, products(id, name)")
    .not("cost_sheet_id", "is", null)
    .order("sort_order");
  if (error) throw new Error("Não foi possível carregar o uso das fichas.");

  const usage = new Map<string, SheetUsage[]>();
  for (const v of data) {
    if (!v.cost_sheet_id || !v.products) continue;
    const list = usage.get(v.cost_sheet_id) ?? [];
    list.push({ productId: v.products.id, productName: v.products.name, variantName: v.name });
    usage.set(v.cost_sheet_id, list);
  }
  return usage;
}
