import { publicEnv } from "@/lib/env";
import type { ChannelStatus } from "@/lib/product-pricing";

export const MODEL_SOURCES = ["own", "makerworld", "printables", "thingiverse", "purchased", "other"] as const;
export type ModelSource = (typeof MODEL_SOURCES)[number];

export const MODEL_SOURCE_LABEL: Record<ModelSource, string> = {
  own: "Autoral",
  makerworld: "MakerWorld",
  printables: "Printables",
  thingiverse: "Thingiverse",
  purchased: "Comprado",
  other: "Outro",
};

/** Rótulo e cor de cada situação de canal (lib/product-pricing.ts). */
export const CHANNEL_STATUS_META: Record<ChannelStatus, { label: string; tone: "success" | "warning" | "destructive" | "muted" }> = {
  ok: { label: "Ok", tone: "success" },
  fees_not_configured: { label: "Taxas não configuradas", tone: "warning" },
  no_price: { label: "Sem preço", tone: "muted" },
  below_min: { label: "Abaixo do mínimo", tone: "warning" },
  loss: { label: "Prejuízo", tone: "destructive" },
  no_sheet: { label: "Sem ficha", tone: "warning" },
  no_filament_cost: { label: "Sem custo de filamento", tone: "warning" },
};

/** Foto pública do bucket "product-images". */
export function productImageUrl(path: string | null): string | null {
  return path ? `${publicEnv.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/product-images/${path}` : null;
}

/** Variação que usa uma ficha de custo. */
export type SheetUsage = { productId: string; productName: string; variantName: string };

/** "Suporte · Xbox, Suporte · PS5" */
export function usageLabel(list: SheetUsage[]): string {
  return list.map((u) => `${u.productName} · ${u.variantName}`).join(", ");
}
