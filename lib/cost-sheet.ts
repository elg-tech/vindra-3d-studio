import { PAYMENT_RATE_COLUMNS, type PaymentRateRow, methodChannelFees, paymentRates } from "@/lib/payment-fees";
import {
  type ChannelFees,
  type CostInput,
  type CostResult,
  type PrinterCosts,
  PricingInputError,
  type RoundingRule,
  calculateCost,
} from "@/lib/pricing";

/**
 * Ficha de custo: o que o usuário preenche na calculadora (e o que fica salvo em
 * cost_sheets). `toCostInput` resolve carretéis, impressora e configurações para
 * a entrada pura de lib/pricing.ts — o mesmo código roda no navegador e no servidor.
 */

export type SheetFilament = {
  /** Carretel específico; null = custo médio do material. */
  filamentId: string | null;
  material: string;
  colorHex: string | null;
  /** Gramas por mesa. */
  grams: number;
  /** O carretel escolhido foi excluído depois (o banco zerou filamentId). */
  spoolRemoved?: boolean;
};

export type SheetExtra = {
  supplyId: string | null;
  name: string;
  /** Quantidade por peça. */
  quantity: number;
  unitCost: number;
};

export type SheetData = {
  printerId: string | null;
  printMinutes: number;
  prepMinutes: number;
  postMinutes: number;
  purgeG: number;
  packagingCost: number;
  quantity: number;
  piecesPerPlate: number;
  filaments: SheetFilament[];
  extras: SheetExtra[];
};

/** Ficha como vem do banco: cost_sheets com cost_sheet_filaments(*) e cost_sheet_supplies(*). */
export type CostSheetRow = {
  printer_id: string | null;
  print_minutes: number;
  prep_minutes: number;
  post_minutes: number;
  purge_g: number;
  packaging_cost: number;
  quantity: number;
  pieces_per_plate: number;
  cost_sheet_filaments: {
    filament_id: string | null;
    material: string;
    color_hex: string | null;
    grams: number;
    sort_order: number;
    spool_removed: boolean;
  }[];
  cost_sheet_supplies: { supply_id: string | null; name: string; quantity: number; unit_cost: number }[];
};

export function sheetFromRow(s: CostSheetRow): SheetData {
  return {
    printerId: s.printer_id,
    printMinutes: s.print_minutes,
    prepMinutes: s.prep_minutes,
    postMinutes: s.post_minutes,
    purgeG: s.purge_g,
    packagingCost: s.packaging_cost,
    quantity: s.quantity,
    piecesPerPlate: s.pieces_per_plate,
    filaments: [...s.cost_sheet_filaments]
      .sort((a, b) => a.sort_order - b.sort_order)
      .map((f) => ({
        filamentId: f.filament_id,
        material: f.material,
        colorHex: f.color_hex,
        grams: f.grams,
        spoolRemoved: f.spool_removed,
      })),
    extras: s.cost_sheet_supplies.map((e) => ({
      supplyId: e.supply_id,
      name: e.name,
      quantity: e.quantity,
      unitCost: e.unit_cost,
    })),
  };
}

export type ContextSpool = {
  id: string;
  material: string;
  color_name: string;
  color_hex: string;
  cost_per_gram: number | null;
  remaining_g: number;
  status: string;
  brand: string | null;
};

export type ContextPrinter = {
  id: string;
  name: string;
  is_default: boolean;
  purchase_price: number | null;
  lifetime_hours: number | null;
  power_watts: number | null;
  maintenance_per_hour: number | null;
};

export type ContextChannel = PaymentRateRow & {
  id: string;
  name: string;
  kind: string;
  commission_pct: number | null;
  extra_pct: number | null;
  fixed_fee: number | null;
};

/** Colunas do canal que a calculadora usa (taxas do pedido e, na Venda direta, por forma de pagamento). */
export const CHANNEL_PRICING_COLUMNS = `id, name, kind, commission_pct, extra_pct, fixed_fee, ${PAYMENT_RATE_COLUMNS}`;

export type PricingContext = {
  settings: {
    energy_rate_kwh: number | null;
    labor_hour_rate: number | null;
    failure_margin_pct: number;
    default_margin_pct: number;
    min_margin_pct: number;
    tax_pct: number;
    rounding_rule: RoundingRule;
  };
  printers: ContextPrinter[];
  channels: ContextChannel[];
  spools: ContextSpool[];
  /** Custo médio por material (R$/g), ponderado pelo estoque. Só materiais com estoque. */
  materialAverages: Record<string, number>;
  /** R$/g do carretel mais recente de cada material (vale quando não há estoque). */
  lastMaterialCosts: Record<string, number>;
};

export function printerCosts(p: ContextPrinter | undefined): PrinterCosts | null {
  if (!p) return null;
  return {
    purchasePrice: p.purchase_price,
    lifetimeHours: p.lifetime_hours,
    powerWatts: p.power_watts,
    maintenancePerHour: p.maintenance_per_hour,
  };
}

/** Taxas do canal para preço e lucro. Venda direta: as do Pix (padrão); a taxa real sai em cada pagamento. */
export function channelFees(c: ContextChannel): ChannelFees {
  if (c.kind === "direct") return methodChannelFees(paymentRates(c).pix);
  return { commissionPct: c.commission_pct, extraPct: c.extra_pct, fixedFee: c.fixed_fee };
}

/** Venda direta: as taxas do cartão de crédito, para mostrar "no crédito: lucro R$ X". Outros canais: null. */
export function creditChannelFees(c: ContextChannel): ChannelFees | null {
  return c.kind === "direct" ? methodChannelFees(paymentRates(c).credit) : null;
}

export type ResolvedFilament = {
  costPerGram: number | null;
  label: string;
  /** Carretel que acabou ou foi excluído, material sem estoque. */
  warnings: string[];
  /** Nenhum carretel do material jamais cadastrado: não há custo a usar. */
  missingCost: boolean;
};

/**
 * Custo do material quando a linha não usa um carretel válido:
 * média do estoque → último preço pago (sem estoque) → nada (nunca comprado).
 */
function materialCost(material: string, ctx: PricingContext) {
  const average = ctx.materialAverages[material];
  if (average !== undefined) return { costPerGram: average, label: `${material} (média)`, source: "average" as const };
  const last = ctx.lastMaterialCosts[material];
  if (last !== undefined) return { costPerGram: last, label: `${material} (último preço pago)`, source: "last" as const };
  return { costPerGram: null, label: `${material} (sem custo)`, source: "none" as const };
}

/**
 * R$/g da linha: do carretel escolhido ou o custo do material (ver materialCost).
 * Carretel que acabou ou foi excluído não define mais o preço. Nunca devolve custo zero
 * por falta de estoque: sem nenhum carretel do material, marca missingCost.
 */
export function resolveFilament(row: SheetFilament, ctx: PricingContext): ResolvedFilament {
  let reason: string | null = null;
  if (row.filamentId) {
    const spool = ctx.spools.find((s) => s.id === row.filamentId);
    if (spool && spool.status !== "empty") {
      return { costPerGram: spool.cost_per_gram, label: `${spool.material} ${spool.color_name}`, warnings: [], missingCost: false };
    }
    reason = spool
      ? `O carretel ${spool.material} ${spool.color_name} acabou`
      : "O carretel escolhido não existe mais";
  } else if (row.spoolRemoved) {
    reason = "O carretel escolhido foi excluído";
  }

  const m = materialCost(row.material, ctx);
  const warnings: string[] = [];
  if (m.source === "average") {
    if (reason) warnings.push(`${reason}: usando a média do ${row.material}.`);
  } else {
    if (reason) warnings.push(`${reason}.`);
    if (m.source === "last") warnings.push(`Sem estoque de ${row.material}, usando o último preço pago.`);
  }
  return { costPerGram: m.costPerGram, label: m.label, warnings, missingCost: m.source === "none" };
}

export type SheetEvaluation =
  | { ok: true; result: CostResult; warnings: string[] }
  | { ok: false; reason: "invalid" | "no_filament_cost"; message: string; warnings: string[] };

/**
 * Regra única da calculadora e dos produtos: resolve os filamentos e calcula o custo.
 * Material nunca comprado bloqueia o cálculo (não conta como R$ 0).
 */
export function evaluateSheet(sheet: SheetData, ctx: PricingContext): SheetEvaluation {
  const resolved = sheet.filaments.map((row) => ({ row, ...resolveFilament(row, ctx) }));
  const warnings = [...new Set(resolved.flatMap((r) => r.warnings))];

  const missing = [...new Set(resolved.filter((r) => r.missingCost && r.row.grams > 0).map((r) => r.row.material))];
  if (missing.length > 0) {
    return {
      ok: false,
      reason: "no_filament_cost",
      message: `Sem custo de filamento: nenhum carretel de ${missing.join(", ")} cadastrado. Cadastre um em Filamentos.`,
      warnings,
    };
  }

  try {
    return { ok: true, result: calculateCost(toCostInput(sheet, ctx)), warnings };
  } catch (e) {
    if (!(e instanceof PricingInputError)) throw e;
    return { ok: false, reason: "invalid", message: e.message, warnings };
  }
}

export function toCostInput(sheet: SheetData, ctx: PricingContext): CostInput {
  return {
    filaments: sheet.filaments.map((row) => {
      const { costPerGram, label } = resolveFilament(row, ctx);
      return { grams: row.grams, costPerGram, label };
    }),
    purgeG: sheet.purgeG,
    printMinutes: sheet.printMinutes,
    piecesPerPlate: sheet.piecesPerPlate,
    quantity: sheet.quantity,
    prepMinutes: sheet.prepMinutes,
    postMinutes: sheet.postMinutes,
    packagingCost: sheet.packagingCost,
    extras: sheet.extras.map((e) => ({ quantity: e.quantity, unitCost: e.unitCost })),
    printer: printerCosts(ctx.printers.find((p) => p.id === sheet.printerId)),
    energyRateKwh: ctx.settings.energy_rate_kwh,
    laborHourRate: ctx.settings.labor_hour_rate,
    failureMarginPct: ctx.settings.failure_margin_pct,
  };
}

function rgb(hex: string): [number, number, number] {
  const h = hex.replace("#", "");
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16)) as [number, number, number];
}

function colorDistance(a: string, b: string): number {
  const [r1, g1, b1] = rgb(a);
  const [r2, g2, b2] = rgb(b);
  return Math.hypot(r1 - r2, g1 - g2, b1 - b2);
}

/** Distância RGB até a qual a cor do carretel é considerada "a mesma" do fatiador. */
export const COLOR_MATCH_THRESHOLD = 60;

/**
 * Carretel do estoque que melhor corresponde ao filamento do fatiador:
 * mesmo material, com saldo, cor mais próxima (até o limite). Prefere carretel em uso.
 * Sem correspondência → null (a linha usa a média do material).
 */
export function matchSpool(material: string, colorHex: string, spools: ContextSpool[]): ContextSpool | null {
  const candidates = spools
    .filter((s) => s.material === material && s.status !== "empty" && s.remaining_g > 0)
    .map((s) => ({ s, d: colorDistance(s.color_hex, colorHex) }))
    .filter(({ d }) => d <= COLOR_MATCH_THRESHOLD)
    .sort((a, b) => a.d - b.d || Number(b.s.status === "in_use") - Number(a.s.status === "in_use"));
  return candidates[0]?.s ?? null;
}
