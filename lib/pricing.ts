/**
 * Cálculos de custo e preço. Funções puras, cobertas por testes em tests/pricing.test.ts.
 *
 * PRODUÇÃO (quanto custa fabricar uma peça):
 *   - por MESA (o que o fatiador mostra): gramas de cada filamento, purga, tempo de impressão;
 *     dividido pelas peças por mesa (custo da mesa cheia: a venda não paga a mesa incompleta)
 *   - por LOTE (uma vez): preparação/fatiamento, dividida pelas peças produzidas (`quantity`)
 *   - por PEÇA: pós-processamento e insumos por peça (ímã, parafuso)
 *   A margem de falha incide só sobre a produção.
 *
 * VENDA (uma vez por pedido = por kit): embalagem, insumos por pedido (etiqueta) e o tempo de
 * separar/embalar/enviar. Sem margem de falha.
 *
 *   custo_kit(n) = custo_peça × n + custos_por_pedido
 *
 * `unit` é o kit de 1 peça (custo_peça + custos_por_pedido): o custo de sempre das fichas e produtos.
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
  /** Quantidade por peça (ou por pedido, com perOrder). */
  quantity: number;
  unitCost: number;
  /** Insumo do pedido (etiqueta), uma vez por kit; senão, por peça. */
  perOrder?: boolean;
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
  /** Peças produzidas no lote: divide o preparo. */
  quantity: number;
  /** Preparação/fatiamento, uma vez por lote (min). */
  prepMinutes: number;
  /** Pós-processamento por peça (min). */
  postMinutes: number;
  /** Embalagem por pedido/kit (R$). */
  packagingCost: number;
  /** Separar, embalar e enviar, por pedido/kit (min). */
  packMinutes?: number;
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

/** Custos de venda, uma vez por pedido (kit). Sem margem de falha. */
export type OrderCosts = {
  packaging: number;
  /** Insumos por pedido (etiqueta…). */
  supplies: number;
  /** Separar, embalar e enviar. */
  labor: number;
  total: number;
};

/** Uma mesa cheia: filamento (com purga) + máquina. Sem mão de obra nem margem de falha. */
export type PlateCosts = {
  filament: number;
  machine: number;
  total: number;
  minutes: number;
  grams: number;
};

/** O que o plano "Quero produzir X peças" precisa, além do resultado por peça. */
type PlanBase = {
  piecesPerPlate: number;
  printMinutes: number;
  purgeG: number;
  /** Gramas por peça sem a purga (a purga é por mesa). */
  pieceGramsNoPurge: number;
  /** Custo do filamento por peça sem a purga. */
  pieceFilamentNoPurge: number;
  purgeCostPerPlate: number;
  machinePerPlate: number;
  /** Preparo do lote (R$), uma vez. */
  prepLabor: number;
  /** Pós + insumos por peça (R$). */
  perPiece: number;
  failureMarginPct: number;
};

export type CostResult = {
  /** Produção de uma peça (custo da mesa cheia ÷ peças por mesa + preparo ÷ lote + pós + insumos), com falha. */
  piece: CostParts;
  /** Custos por pedido (kit). */
  order: OrderCosts;
  /** Kit de 1 peça: peça + custos por pedido. */
  unit: CostParts;
  plate: PlateCosts;
  /** Tempo de impressora por peça (min). */
  pieceMinutes: number;
  /** Gramas por peça (inclui a purga). */
  pieceGrams: number;
  /** Horas de impressora de uma mesa. */
  printHours: number;
  /** Gramas de uma mesa (inclui purga). */
  grams: number;
  /** Itens não configurados que entraram como R$ 0. */
  warnings: string[];
  planBase: PlanBase;
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
    ["Separar e embalar", input.packMinutes ?? 0],
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
  const ppp = input.piecesPerPlate;
  const plateHours = input.printMinutes / 60;
  const packMinutes = input.packMinutes ?? 0;

  // Filamento (por mesa)
  for (const f of input.filaments) {
    if (f.costPerGram === null && f.grams > 0)
      warnings.push(`Sem custo por grama para ${f.label ?? "um filamento"}: contado como R$ 0.`);
  }
  const modelFilament = input.filaments.reduce((s, f) => s + f.grams * (f.costPerGram ?? 0), 0);
  const purgeCost = input.purgeG * weightedCostPerGram(input.filaments);
  const modelGrams = input.filaments.reduce((s, f) => s + f.grams, 0);
  const plateGrams = modelGrams + input.purgeG;

  // Máquina (por hora)
  const p = input.printer;
  if (!p) warnings.push("Nenhuma impressora selecionada: energia, depreciação e manutenção contadas como R$ 0.");

  let energyPerHour = 0;
  if (p) {
    if (p.powerWatts === null) warnings.push("Consumo (W) da impressora não informado: energia contada como R$ 0.");
    else if (input.energyRateKwh === null) warnings.push("Tarifa de energia não configurada: energia contada como R$ 0.");
    else energyPerHour = energyCostPerHour(p.powerWatts, input.energyRateKwh);
  }

  let depreciationRate = 0;
  if (p) {
    if (p.purchasePrice === null || p.lifetimeHours === null || p.lifetimeHours <= 0)
      warnings.push("Valor ou vida útil da impressora não informados: depreciação contada como R$ 0.");
    else depreciationRate = depreciationPerHour(p.purchasePrice, p.lifetimeHours);
  }

  let maintenanceRate = 0;
  if (p) {
    if (p.maintenancePerHour === null) warnings.push("Manutenção por hora não informada: contada como R$ 0.");
    else maintenanceRate = p.maintenancePerHour;
  }

  // Mão de obra
  const rate = input.laborHourRate;
  if (rate === null && input.prepMinutes + input.postMinutes + packMinutes > 0)
    warnings.push("Valor da hora de trabalho não configurado: mão de obra contada como R$ 0.");
  const hourCost = (minutes: number) => (rate === null ? 0 : (minutes / 60) * rate);
  const prepLabor = hourCost(input.prepMinutes);
  const postLabor = hourCost(input.postMinutes);

  const extrasPerPiece = input.extras.filter((e) => !e.perOrder).reduce((s, e) => s + e.quantity * e.unitCost, 0);
  const extrasPerOrder = input.extras.filter((e) => e.perOrder).reduce((s, e) => s + e.quantity * e.unitCost, 0);

  // Peça: mesa cheia ÷ peças por mesa; preparo ÷ peças produzidas
  const pieceHours = plateHours / ppp;
  const filament = (modelFilament + purgeCost) / ppp;
  const energy = energyPerHour * pieceHours;
  const depreciation = depreciationRate * pieceHours;
  const maintenance = maintenanceRate * pieceHours;
  const labor = prepLabor / input.quantity + postLabor;
  const supplies = extrasPerPiece;
  const subtotal = filament + energy + depreciation + maintenance + labor + supplies;
  const failure = subtotal * (input.failureMarginPct / 100);
  const piece: CostParts = { filament, energy, depreciation, maintenance, labor, supplies, subtotal, failure, total: subtotal + failure };

  // Pedido (kit), sem falha
  const orderLabor = hourCost(packMinutes);
  const order: OrderCosts = {
    packaging: input.packagingCost,
    supplies: extrasPerOrder,
    labor: orderLabor,
    total: input.packagingCost + extrasPerOrder + orderLabor,
  };

  const unit: CostParts = {
    ...piece,
    labor: piece.labor + order.labor,
    supplies: piece.supplies + order.packaging + order.supplies,
    subtotal: piece.subtotal + order.total,
    total: piece.total + order.total,
  };

  const machinePerPlate = (energyPerHour + depreciationRate + maintenanceRate) * plateHours;
  const plate: PlateCosts = {
    filament: modelFilament + purgeCost,
    machine: machinePerPlate,
    total: modelFilament + purgeCost + machinePerPlate,
    minutes: input.printMinutes,
    grams: plateGrams,
  };

  return {
    piece,
    order,
    unit,
    plate,
    pieceMinutes: input.printMinutes / ppp,
    pieceGrams: plateGrams / ppp,
    printHours: plateHours,
    grams: plateGrams,
    warnings,
    planBase: {
      piecesPerPlate: ppp,
      printMinutes: input.printMinutes,
      purgeG: input.purgeG,
      pieceGramsNoPurge: modelGrams / ppp,
      pieceFilamentNoPurge: modelFilament / ppp,
      purgeCostPerPlate: purgeCost,
      machinePerPlate,
      prepLabor,
      perPiece: postLabor + extrasPerPiece,
      failureMarginPct: input.failureMarginPct,
    },
  };
}

// ---------------------------------------------------------------
// Kit e plano de produção
// ---------------------------------------------------------------

/** custo_kit = custo_peça × n + custos_por_pedido. */
export function kitCost(r: CostResult, piecesPerKit: number): number {
  return r.piece.total * piecesPerKit + r.order.total;
}

/** Parte do custo do kit que é hora de trabalho (pós/preparo com a margem de falha + embalar). */
export function kitLaborCost(r: CostResult, piecesPerKit: number): number {
  return r.piece.labor * (1 + r.planBase.failureMarginPct / 100) * piecesPerKit + r.order.labor;
}

export type ProductionPlan = {
  pieces: number;
  plates: number;
  /** Peças na última mesa (= peças por mesa quando fecha certo). */
  lastPlatePieces: number;
  minutes: number;
  grams: number;
  /** Custo de produção do lote, com falha (sem os custos por pedido). */
  cost: number;
  /** Custo médio real por peça do lote (sobe quando a última mesa sai incompleta). */
  costPerPiece: number;
};

/**
 * "Quero produzir X peças" (informativo): a última mesa incompleta conta como mesa inteira de tempo e
 * máquina, mas só com as gramas das peças que tiver (mais a purga da mesa). O preparo entra uma vez.
 */
export function productionPlan(r: CostResult, pieces: number): ProductionPlan {
  if (!Number.isInteger(pieces) || pieces < 1) throw new PricingInputError("Peças a produzir precisa ser um inteiro ≥ 1.");
  const b = r.planBase;
  const plates = Math.ceil(pieces / b.piecesPerPlate);
  const subtotal =
    plates * (b.machinePerPlate + b.purgeCostPerPlate) + pieces * (b.pieceFilamentNoPurge + b.perPiece) + b.prepLabor;
  const cost = subtotal * (1 + b.failureMarginPct / 100);
  return {
    pieces,
    plates,
    lastPlatePieces: pieces - (plates - 1) * b.piecesPerPlate,
    minutes: plates * b.printMinutes,
    grams: pieces * b.pieceGramsNoPurge + plates * b.purgeG,
    cost,
    costPerPiece: cost / pieces,
  };
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

/**
 * Taxas de um pedido de plataforma: % sobre o total + taxa fixa por unidade vendida
 * (2 × "Kit 5" = 2 taxas fixas). Pedido sem itens paga uma taxa fixa.
 */
export function orderChannelFees(total: number, units: number, fees: ChannelFees): number {
  const pct = ((fees.commissionPct ?? 0) + (fees.extraPct ?? 0)) / 100;
  return total * pct + (fees.fixedFee ?? 0) * Math.max(1, Math.round(units));
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

// ---------------------------------------------------------------
// Preço do kit
// ---------------------------------------------------------------

/**
 * Preço sugerido do kit de n peças num canal:
 *   preço_kit = (custo_peça × n + custos_por_pedido + taxa_fixa) ÷ (1 − comissão − adicional − imposto − margem)
 * A taxa fixa entra UMA vez por kit (o kit é um item do anúncio).
 */
export function suggestKitPrice(
  r: CostResult,
  piecesPerKit: number,
  fees: ChannelFees,
  taxPct: number,
  marginPct: number,
  rounding: RoundingRule,
): SuggestedPrice {
  return suggestPrice(kitCost(r, piecesPerKit), fees, taxPct, marginPct, rounding);
}

/** Desconto por peça do kit em relação ao kit de 1 (em pontos: 40 = a peça sai 40% mais barata). */
export function perPieceDiscountPct(kitPrice: number, piecesPerKit: number, singlePrice: number): number | null {
  if (singlePrice <= 0 || piecesPerKit < 1) return null;
  return (1 - kitPrice / piecesPerKit / singlePrice) * 100;
}
