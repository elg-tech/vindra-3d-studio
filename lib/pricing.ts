/**
 * Cálculos de custo e preço. Funções puras, cobertas por testes em tests/pricing.test.ts.
 *
 * Unidades de cada entrada:
 *   - por MESA (o que o fatiador mostra): gramas de cada filamento, purga, tempo de impressão
 *   - por LOTE (uma vez): preparação/fatiamento
 *   - por PEÇA: pós-processamento, embalagem, insumos extras
 *
 * Custos de mesa são divididos pelas peças por mesa. Se a quantidade não fecha mesas
 * inteiras (ex.: 5 peças, 4 por mesa), a última mesa é contada proporcionalmente.
 *
 * Percentuais sempre em "pontos" (10 = 10%).
 */

/** Depreciação da impressora por hora de uso = valor pago ÷ vida útil (h). */
export function depreciationPerHour(purchasePrice: number, lifetimeHours: number): number {
  if (lifetimeHours <= 0) throw new Error("Vida útil precisa ser maior que zero.");
  return purchasePrice / lifetimeHours;
}

/** Custo de energia por hora = (watts ÷ 1000) × tarifa (R$/kWh). */
export function energyCostPerHour(powerWatts: number, tariffPerKwh: number): number {
  return (powerWatts / 1000) * tariffPerKwh;
}

// ---------------------------------------------------------------
// Custo
// ---------------------------------------------------------------

export type FilamentLine = {
  /** Gramas por mesa. */
  grams: number;
  /** R$/g; null quando não há custo conhecido (vira aviso e conta como 0). */
  costPerGram: number | null;
  label?: string;
};

export type ExtraLine = {
  /** Quantidade por peça. */
  quantity: number;
  unitCost: number;
};

export type PrinterCosts = {
  purchasePrice: number | null;
  lifetimeHours: number | null;
  powerWatts: number | null;
  maintenancePerHour: number | null;
};

export type CostInput = {
  filaments: FilamentLine[];
  /** Desperdício/purga por mesa (g), ao custo médio dos filamentos usados. */
  purgeG: number;
  /** Tempo de impressão de uma mesa (min). */
  printMinutes: number;
  piecesPerPlate: number;
  quantity: number;
  /** Preparação/fatiamento, uma vez por lote (min). */
  prepMinutes: number;
  /** Pós-processamento por peça (min). */
  postMinutes: number;
  /** Embalagem por peça (R$). */
  packagingCost: number;
  extras: ExtraLine[];
  printer: PrinterCosts | null;
  energyRateKwh: number | null;
  laborHourRate: number | null;
  failureMarginPct: number;
};

export type CostParts = {
  filament: number;
  energy: number;
  depreciation: number;
  maintenance: number;
  labor: number;
  supplies: number;
  /** Soma das partes acima. */
  subtotal: number;
  /** Acréscimo da margem de falha. */
  failure: number;
  total: number;
};

export type CostResult = {
  /** Custos do lote inteiro (todas as peças). */
  lot: CostParts;
  /** Custos por peça (lote ÷ quantidade). */
  unit: CostParts;
  /** Horas de impressora no lote. */
  printHours: number;
  /** Gramas de filamento no lote (inclui purga). */
  grams: number;
  /** Itens não configurados que entraram como R$ 0. */
  warnings: string[];
};

export class PricingInputError extends Error {}

function assertInput(input: CostInput) {
  const { quantity, piecesPerPlate, printMinutes, purgeG, prepMinutes, postMinutes, packagingCost } = input;
  if (!Number.isInteger(quantity) || quantity < 1) throw new PricingInputError("Quantidade precisa ser um inteiro ≥ 1.");
  if (!Number.isInteger(piecesPerPlate) || piecesPerPlate < 1)
    throw new PricingInputError("Peças por mesa precisa ser um inteiro ≥ 1.");
  for (const [name, v] of [
    ["Tempo de impressão", printMinutes],
    ["Purga", purgeG],
    ["Preparação", prepMinutes],
    ["Pós-processamento", postMinutes],
    ["Embalagem", packagingCost],
  ] as const) {
    if (!Number.isFinite(v) || v < 0) throw new PricingInputError(`${name} não pode ser negativo.`);
  }
  if (input.failureMarginPct < 0 || input.failureMarginPct >= 100)
    throw new PricingInputError("Margem de falha precisa estar entre 0% e 99%.");
  if (input.filaments.some((f) => !Number.isFinite(f.grams) || f.grams < 0))
    throw new PricingInputError("Gramas de filamento não podem ser negativos.");
  if (input.extras.some((e) => e.quantity < 0 || e.unitCost < 0))
    throw new PricingInputError("Insumos não podem ter valores negativos.");
}

/** Custo médio por grama dos filamentos da mesa, ponderado pelos gramas (usado na purga). */
export function weightedCostPerGram(filaments: FilamentLine[]): number {
  const known = filaments.filter((f) => f.costPerGram !== null);
  const grams = known.reduce((s, f) => s + f.grams, 0);
  if (grams > 0) return known.reduce((s, f) => s + f.grams * (f.costPerGram ?? 0), 0) / grams;
  // sem gramas informados: média simples dos custos conhecidos
  return known.length > 0 ? known.reduce((s, f) => s + (f.costPerGram ?? 0), 0) / known.length : 0;
}

export function calculateCost(input: CostInput): CostResult {
  assertInput(input);
  const warnings: string[] = [];
  const q = input.quantity;
  const plates = q / input.piecesPerPlate; // mesas equivalentes
  const printHours = (input.printMinutes / 60) * plates;

  // Filamento
  for (const f of input.filaments) {
    if (f.costPerGram === null && f.grams > 0)
      warnings.push(`Sem custo por grama para ${f.label ?? "um filamento"}: contado como R$ 0.`);
  }
  const filamentPerPlate =
    input.filaments.reduce((s, f) => s + f.grams * (f.costPerGram ?? 0), 0) +
    input.purgeG * weightedCostPerGram(input.filaments);
  const filament = filamentPerPlate * plates;
  const grams = (input.filaments.reduce((s, f) => s + f.grams, 0) + input.purgeG) * plates;

  // Máquina
  const p = input.printer;
  if (!p) warnings.push("Nenhuma impressora selecionada: energia, depreciação e manutenção contadas como R$ 0.");

  let energy = 0;
  if (p) {
    if (p.powerWatts === null) warnings.push("Consumo (W) da impressora não informado: energia contada como R$ 0.");
    else if (input.energyRateKwh === null) warnings.push("Tarifa de energia não configurada: energia contada como R$ 0.");
    else energy = energyCostPerHour(p.powerWatts, input.energyRateKwh) * printHours;
  }

  let depreciation = 0;
  if (p) {
    if (p.purchasePrice === null || p.lifetimeHours === null || p.lifetimeHours <= 0)
      warnings.push("Valor ou vida útil da impressora não informados: depreciação contada como R$ 0.");
    else depreciation = depreciationPerHour(p.purchasePrice, p.lifetimeHours) * printHours;
  }

  let maintenance = 0;
  if (p) {
    if (p.maintenancePerHour === null) warnings.push("Manutenção por hora não informada: contada como R$ 0.");
    else maintenance = p.maintenancePerHour * printHours;
  }

  // Mão de obra: preparo uma vez por lote + pós por peça
  const laborMinutes = input.prepMinutes + input.postMinutes * q;
  let labor = 0;
  if (laborMinutes > 0) {
    if (input.laborHourRate === null) warnings.push("Valor da hora de trabalho não configurado: mão de obra contada como R$ 0.");
    else labor = (laborMinutes / 60) * input.laborHourRate;
  }

  // Insumos: embalagem + extras, por peça
  const supplies = q * (input.packagingCost + input.extras.reduce((s, e) => s + e.quantity * e.unitCost, 0));

  const subtotal = filament + energy + depreciation + maintenance + labor + supplies;
  const failure = subtotal * (input.failureMarginPct / 100);
  const lot: CostParts = {
    filament,
    energy,
    depreciation,
    maintenance,
    labor,
    supplies,
    subtotal,
    failure,
    total: subtotal + failure,
  };
  const unit = Object.fromEntries(Object.entries(lot).map(([k, v]) => [k, v / q])) as CostParts;

  return { lot, unit, printHours, grams, warnings };
}

// ---------------------------------------------------------------
// Preço por canal
// ---------------------------------------------------------------

export type RoundingRule = "none" | "cents_90" | "cents_99" | "integer";

export type ChannelFees = {
  commissionPct: number | null;
  extraPct: number | null;
  fixedFee: number | null;
};

/** Canal sem nenhuma taxa preenchida. */
export function isChannelConfigured(fees: ChannelFees): boolean {
  return fees.commissionPct !== null || fees.extraPct !== null || fees.fixedFee !== null;
}

/** Arredonda o preço PARA CIMA (nunca reduz a margem). */
export function roundPrice(value: number, rule: RoundingRule): number {
  // centavos, tolerando ruído de ponto flutuante (24,900000001 → 2490)
  const cents = Math.ceil(value * 100 - 1e-6);
  switch (rule) {
    case "none":
      return cents / 100;
    case "integer":
      return Math.ceil(cents / 100);
    case "cents_90":
    case "cents_99": {
      const ending = rule === "cents_90" ? 90 : 99;
      let target = Math.floor(cents / 100) * 100 + ending;
      if (target < cents) target += 100;
      return target / 100;
    }
  }
}

export type ProfitResult = {
  price: number;
  /** Comissão + taxa adicional + taxa fixa. */
  channelFees: number;
  tax: number;
  unitCost: number;
  profit: number;
  /** Lucro ÷ preço, em pontos (25 = 25%). */
  marginPct: number;
};

/** Lucro líquido real vendendo uma peça por `price` no canal. */
export function profitAtPrice(price: number, unitCost: number, fees: ChannelFees, taxPct: number): ProfitResult {
  const pctFees = ((fees.commissionPct ?? 0) + (fees.extraPct ?? 0)) / 100;
  const channelFees = price * pctFees + (fees.fixedFee ?? 0);
  const tax = price * (taxPct / 100);
  const profit = price - channelFees - tax - unitCost;
  return { price, channelFees, tax, unitCost, profit, marginPct: price > 0 ? (profit / price) * 100 : 0 };
}

export type SuggestedPrice =
  | ({ ok: true; rawPrice: number } & ProfitResult)
  | { ok: false; error: string; deductionsPct: number };

/**
 * preço = (custoUnitário + taxaFixa) ÷ (1 − comissão − taxaExtra − imposto − margem)
 * depois arredondado para cima pela regra. O lucro é recalculado no preço final.
 */
export function suggestPrice(
  unitCost: number,
  fees: ChannelFees,
  taxPct: number,
  marginPct: number,
  rounding: RoundingRule,
): SuggestedPrice {
  const deductionsPct = (fees.commissionPct ?? 0) + (fees.extraPct ?? 0) + taxPct + marginPct;
  const denominator = 1 - deductionsPct / 100;
  if (denominator <= 0) {
    return { ok: false, error: "Margem + taxas passam de 100%: não existe preço possível.", deductionsPct };
  }
  const rawPrice = (unitCost + (fees.fixedFee ?? 0)) / denominator;
  const price = roundPrice(rawPrice, rounding);
  return { ok: true, rawPrice, ...profitAtPrice(price, unitCost, fees, taxPct) };
}
