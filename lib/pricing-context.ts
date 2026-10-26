import "server-only";
import type { PricingContext } from "@/lib/cost-sheet";
import { averageCostByMaterial, lastCostByMaterial } from "@/lib/filaments";
import type { RoundingRule } from "@/lib/pricing";
import type { createClient } from "@/lib/supabase/server";

type Supabase = Awaited<ReturnType<typeof createClient>>;

/** Carrega tudo que a calculadora precisa: configurações, impressoras, canais e carretéis. */
export async function loadPricingContext(supabase: Supabase): Promise<PricingContext> {
  const [settings, printers, channels, spools] = await Promise.all([
    supabase
      .from("settings")
      .select("energy_rate_kwh, labor_hour_rate, failure_margin_pct, default_margin_pct, min_margin_pct, tax_pct, rounding_rule")
      .single(),
    supabase
      .from("printers")
      .select("id, name, is_default, purchase_price, lifetime_hours, power_watts, maintenance_per_hour")
      .eq("active", true)
      .order("is_default", { ascending: false })
      .order("name"),
    supabase
      .from("sales_channels")
      .select("id, name, kind, commission_pct, extra_pct, fixed_fee")
      .eq("active", true)
      .order("sort_order"),
    supabase
      .from("filaments")
      .select("id, material, color_name, color_hex, cost_per_gram, remaining_g, net_weight_g, status, purchased_at, created_at, filament_brands(name)")
      .order("material")
      .order("color_name"),
  ]);

  if (settings.error) throw new Error("Não foi possível carregar as configurações.");

  const spoolRows = spools.data ?? [];
  return {
    settings: { ...settings.data, rounding_rule: settings.data.rounding_rule as RoundingRule },
    printers: printers.data ?? [],
    channels: channels.data ?? [],
    spools: spoolRows.map((s) => ({
      id: s.id,
      material: s.material,
      color_name: s.color_name,
      color_hex: s.color_hex,
      cost_per_gram: s.cost_per_gram,
      remaining_g: s.remaining_g,
      status: s.status,
      brand: s.filament_brands?.name ?? null,
    })),
    materialAverages: Object.fromEntries(averageCostByMaterial(spoolRows)),
    lastMaterialCosts: Object.fromEntries(lastCostByMaterial(spoolRows)),
  };
}
