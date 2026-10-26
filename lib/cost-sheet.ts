import type { ChannelFees, CostInput, PrinterCosts, RoundingRule } from "@/lib/pricing";

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

export type ContextChannel = {
  id: string;
  name: string;
  kind: string;
  commission_pct: number | null;
  extra_pct: number | null;
  fixed_fee: number | null;
};

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
  /** Custo médio por material (R$/g), ponderado pelo estoque. */
  materialAverages: Record<string, number>;
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

export function channelFees(c: ContextChannel): ChannelFees {
  return { commissionPct: c.commission_pct, extraPct: c.extra_pct, fixedFee: c.fixed_fee };
}

export type ResolvedFilament = {
  costPerGram: number | null;
  label: string;
  /** Preenchido quando o carretel escolhido acabou ou foi excluído e a linha caiu na média. */
  warning: string | null;
};

/**
 * R$/g da linha: do carretel escolhido ou a média do material.
 * Carretel que acabou ou foi excluído não define mais o preço: vale a média atual do material.
 */
export function resolveFilament(row: SheetFilament, ctx: PricingContext): ResolvedFilament {
  const average = ctx.materialAverages[row.material] ?? null;
  const averageLabel = `${row.material} (média)`;
  if (row.filamentId) {
    const spool = ctx.spools.find((s) => s.id === row.filamentId);
    const name = spool ? `${spool.material} ${spool.color_name}` : null;
    if (spool && name && spool.status !== "empty") return { costPerGram: spool.cost_per_gram, label: name, warning: null };
    return {
      costPerGram: average,
      label: averageLabel,
      warning: spool
        ? `O carretel ${name} acabou: usando a média do ${row.material}.`
        : `O carretel escolhido não existe mais: usando a média do ${row.material}.`,
    };
  }
  if (row.spoolRemoved) {
    return {
      costPerGram: average,
      label: averageLabel,
      warning: `O carretel escolhido foi excluído: usando a média do ${row.material}.`,
    };
  }
  return { costPerGram: average, label: averageLabel, warning: null };
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
