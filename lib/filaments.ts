import { round } from "@/lib/numbers";

export const MATERIALS = ["PLA", "PLA Silk", "PLA Matte", "PETG", "TPU", "ABS", "ASA", "Outro"] as const;
export type Material = (typeof MATERIALS)[number];

export const FILAMENT_STATUS = ["sealed", "in_use", "empty"] as const;
export type FilamentStatus = (typeof FILAMENT_STATUS)[number];

export const FILAMENT_STATUS_LABEL: Record<FilamentStatus, string> = {
  sealed: "Lacrado",
  in_use: "Em uso",
  empty: "Acabou",
};

export const MOVEMENT_KIND_LABEL = {
  purchase: "Entrada",
  consumption: "Consumo",
  adjustment: "Ajuste",
  failure: "Falha de impressão",
} as const;

/** Custo por grama = (preço + frete) ÷ peso líquido. */
export function costPerGram(pricePaid: number, shippingCost: number, netWeightG: number): number {
  if (netWeightG <= 0) throw new Error("Peso líquido precisa ser maior que zero.");
  return (pricePaid + shippingCost) / netWeightG;
}

/**
 * "Pesar carretel": peso na balança menos o carretel vazio = filamento restante.
 * Nunca negativo. Retorna também o ajuste a lançar em relação ao saldo atual.
 */
export function weighSpool(scaleWeightG: number, emptySpoolWeightG: number, currentRemainingG: number) {
  const remainingG = round(Math.max(scaleWeightG - emptySpoolWeightG, 0));
  return { remainingG, adjustmentG: round(remainingG - currentRemainingG) };
}

/** Percentual restante do carretel, entre 0 e 100. */
export function remainingPercent(remainingG: number, netWeightG: number): number {
  if (netWeightG <= 0) return 0;
  return Math.min(Math.max((remainingG / netWeightG) * 100, 0), 100);
}

export function isLowStock(remainingG: number, minStockG: number, status: FilamentStatus): boolean {
  return status !== "empty" && remainingG <= minStockG;
}

export type SpoolForAverage = {
  material: string;
  cost_per_gram: number | null;
  remaining_g: number;
  net_weight_g: number;
};

/**
 * Custo médio por material, ponderado pelos gramas em estoque (é o que vai ser consumido).
 * Se não há estoque de um material, pondera pelo peso comprado de todos os carretéis dele.
 */
export function averageCostByMaterial(spools: SpoolForAverage[]): Map<string, number> {
  const groups = new Map<string, SpoolForAverage[]>();
  for (const s of spools) {
    if (s.cost_per_gram === null) continue;
    groups.set(s.material, [...(groups.get(s.material) ?? []), s]);
  }

  const result = new Map<string, number>();
  for (const [material, list] of groups) {
    const inStock = list.filter((s) => s.remaining_g > 0);
    const [items, weightOf] =
      inStock.length > 0
        ? [inStock, (s: SpoolForAverage) => s.remaining_g]
        : [list, (s: SpoolForAverage) => s.net_weight_g];
    const totalWeight = items.reduce((sum, s) => sum + weightOf(s), 0);
    if (totalWeight <= 0) continue;
    result.set(material, items.reduce((sum, s) => sum + (s.cost_per_gram ?? 0) * weightOf(s), 0) / totalWeight);
  }
  return result;
}
