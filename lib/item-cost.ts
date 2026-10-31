import type { z } from "zod";
import { type PricingContext, type SheetData, evaluateSheet } from "@/lib/cost-sheet";
import type { CostResult } from "@/lib/pricing";
import type { Json } from "@/lib/supabase/database.types";
import { itemCostSchema } from "@/lib/validation/sheet";

/**
 * Custo do item avulso (orçamento e pedido), sem produto nem ficha salva:
 * - "calc": mini calculadora, a mesma conta da calculadora (evaluateSheet) com a quantidade do item;
 * - "manual": custo + mão de obra digitados, por peça.
 * O preço do item nunca é tocado aqui.
 */
export type ItemCost = z.output<typeof itemCostSchema>;

export type ItemCostValue = {
  /** Custo por peça, com a mão de obra. */
  unitCost: number;
  /** Parte do custo por peça que é hora de trabalho (DRE "sem a sua hora"). */
  unitLaborCost: number;
};

export type ItemCostEvaluation =
  | ({ ok: true; result: CostResult | null; warnings: string[] } & ItemCostValue)
  | { ok: false; message: string; warnings: string[] };

const round4 = (n: number) => Math.round(n * 10_000) / 10_000;

/** Custo por peça e a mão de obra contida nele, com o mesmo acréscimo da margem de falha do custo. */
export function sheetUnitCosts(result: CostResult, failureMarginPct: number): ItemCostValue {
  return {
    unitCost: round4(result.unit.total),
    unitLaborCost: round4(result.unit.labor * (1 + failureMarginPct / 100)),
  };
}

/** Manual: os dois campos somam; a mão de obra é a parte de hora de trabalho. */
export function manualItemCost(cost: number, labor: number): ItemCostValue {
  return { unitCost: round4(cost + labor), unitLaborCost: round4(labor) };
}

/** A ficha da mini calculadora com a quantidade do item (o preparo do lote se divide entre as peças). */
export function itemSheet(cost: ItemCost | null, quantity: number): SheetData | null {
  if (!cost || cost.source !== "calc") return null;
  return { ...cost.sheet, quantity: Math.max(1, Math.round(quantity)) };
}

export function evaluateItemCost(cost: ItemCost, quantity: number, ctx: PricingContext): ItemCostEvaluation {
  if (cost.source === "manual") return { ok: true, result: null, warnings: [], ...manualItemCost(cost.cost, cost.labor) };
  const evaluation = evaluateSheet(itemSheet(cost, quantity)!, ctx);
  if (!evaluation.ok) return { ok: false, message: evaluation.message, warnings: evaluation.warnings };
  return {
    ok: true,
    result: evaluation.result,
    warnings: [...new Set([...evaluation.warnings, ...evaluation.result.warnings])],
    ...sheetUnitCosts(evaluation.result, ctx.settings.failure_margin_pct),
  };
}

/** Lê o custo guardado no item (cost_source + cost_input). Registro inválido = sem custo editável. */
export function storedItemCost(source: string | null, input: unknown): ItemCost | null {
  if (source !== "calc" && source !== "manual") return null;
  const parsed = itemCostSchema.safeParse({ ...(input as object), source });
  return parsed.success ? parsed.data : null;
}

/** O que vai para cost_input no banco (a origem fica em cost_source). */
export function costInputOf(cost: ItemCost): Json {
  return (cost.source === "calc" ? { sheet: cost.sheet } : { cost: cost.cost, labor: cost.labor }) as Json;
}

/** Campos do item para o banco. Sem custo: tudo nulo (o item continua permitido, com aviso). */
export function itemCostFields(
  cost: ItemCost | null,
  quantity: number,
  ctx: PricingContext,
):
  | { ok: true; unitCost: number | null; unitLaborCost: number | null; costSource: ItemCost["source"] | null; costInput: Json | null }
  | { ok: false; message: string } {
  if (!cost) return { ok: true, unitCost: null, unitLaborCost: null, costSource: null, costInput: null };
  const evaluation = evaluateItemCost(cost, quantity, ctx);
  if (!evaluation.ok) return { ok: false, message: evaluation.message };
  return {
    ok: true,
    unitCost: evaluation.unitCost,
    unitLaborCost: evaluation.unitLaborCost,
    costSource: cost.source,
    costInput: costInputOf(cost),
  };
}

/** Lucro do item antes de taxas e imposto: (preço − custo) × quantidade; margem sobre o preço. */
export function itemMargin(quantity: number, unitPrice: number, unitCost: number) {
  const profit = (unitPrice - unitCost) * quantity;
  return { profit, marginPct: unitPrice > 0 ? ((unitPrice - unitCost) / unitPrice) * 100 : null };
}
