import { describe, expect, it } from "vitest";
import {
  type ChannelFees,
  type CostInput,
  PricingInputError,
  calculateCost,
  depreciationPerHour,
  energyCostPerHour,
  isChannelConfigured,
  kitCost,
  kitLaborCost,
  orderChannelFees,
  perPieceDiscountPct,
  productionPlan,
  profitAtPrice,
  suggestKitPrice,
  roundPrice,
  suggestPrice,
  weightedCostPerGram,
} from "@/lib/pricing";

// A1 de referência: R$ 2.500 / 5.000 h = R$ 0,50/h; 100 W a R$ 0,80 = R$ 0,08/h; manutenção R$ 0,10/h
// → máquina R$ 0,68/h. Hora de trabalho R$ 30.
const A1 = { purchasePrice: 2500, lifetimeHours: 5000, powerWatts: 100, maintenancePerHour: 0.1 };

function input(overrides: Partial<CostInput> = {}): CostInput {
  return {
    filaments: [],
    purgeG: 0,
    printMinutes: 0,
    piecesPerPlate: 1,
    quantity: 1,
    prepMinutes: 0,
    postMinutes: 0,
    packagingCost: 0,
    extras: [],
    printer: A1,
    energyRateKwh: 0.8,
    laborHourRate: 30,
    failureMarginPct: 0,
    ...overrides,
  };
}

describe("blocos básicos", () => {
  it("depreciação e energia por hora", () => {
    expect(depreciationPerHour(2500, 5000)).toBeCloseTo(0.5, 10);
    expect(energyCostPerHour(95, 0.85)).toBeCloseTo(0.08075, 10);
    expect(() => depreciationPerHour(2500, 0)).toThrow();
  });

  it("custo médio da purga é ponderado pelos gramas", () => {
    expect(
      weightedCostPerGram([
        { grams: 30, costPerGram: 0.1 },
        { grams: 10, costPerGram: 0.14 },
      ]),
    ).toBeCloseTo(0.11, 10);
  });
});

describe("calculateCost", () => {
  it("peça simples (conferida à mão): falha só na produção, embalagem por pedido", () => {
    const r = calculateCost(
      input({
        filaments: [{ grams: 50, costPerGram: 0.1 }], // R$ 5,00
        printMinutes: 120, // 2 h → energia 0,16 · depreciação 1,00 · manutenção 0,20
        prepMinutes: 10,
        postMinutes: 5, // 15 min × R$ 30/h = 7,50
        packagingCost: 1.5, // por pedido, sem falha
        extras: [{ quantity: 1, unitCost: 0.2 }], // insumo por peça
        failureMarginPct: 10,
      }),
    );
    // produção: 5 + 0,16 + 1 + 0,2 + 7,5 + 0,2 = 14,06; falha 1,406
    expect(r.piece.filament).toBeCloseTo(5, 10);
    expect(r.piece.energy).toBeCloseTo(0.16, 10);
    expect(r.piece.depreciation).toBeCloseTo(1, 10);
    expect(r.piece.maintenance).toBeCloseTo(0.2, 10);
    expect(r.piece.labor).toBeCloseTo(7.5, 10);
    expect(r.piece.supplies).toBeCloseTo(0.2, 10);
    expect(r.piece.subtotal).toBeCloseTo(14.06, 10);
    expect(r.piece.failure).toBeCloseTo(1.406, 10);
    expect(r.piece.total).toBeCloseTo(15.466, 10);
    // pedido: só a embalagem
    expect(r.order).toEqual({ packaging: 1.5, supplies: 0, labor: 0, total: 1.5 });
    // kit de 1 (o custo de sempre da ficha): peça + pedido
    expect(r.unit.supplies).toBeCloseTo(1.7, 10);
    expect(r.unit.failure).toBeCloseTo(1.406, 10);
    expect(r.unit.total).toBeCloseTo(16.966, 10);
    expect(r.plate.filament).toBeCloseTo(5, 10);
    expect(r.plate.machine).toBeCloseTo(1.36, 10);
    expect(r.plate.total).toBeCloseTo(6.36, 10);
    expect(r.plate.minutes).toBe(120);
    expect(r.printHours).toBeCloseTo(2, 10);
    expect(r.grams).toBeCloseTo(50, 10);
    expect(r.warnings).toEqual([]);
  });

  it("multi-cor (AMS Lite) com purga ao custo médio", () => {
    const r = calculateCost(
      input({
        filaments: [
          { grams: 30, costPerGram: 0.1 }, // 3,00
          { grams: 10, costPerGram: 0.14 }, // 1,40
        ],
        purgeG: 8, // 8 × 0,11 = 0,88
        printMinutes: 90, // 1,5 h × 0,68 = 1,02
      }),
    );
    expect(r.unit.filament).toBeCloseTo(5.28, 10);
    expect(r.unit.energy + r.unit.depreciation + r.unit.maintenance).toBeCloseTo(1.02, 10);
    expect(r.unit.total).toBeCloseTo(6.3, 10);
    expect(r.grams).toBeCloseTo(48, 10);
  });

  it("várias peças por mesa dividem tempo, energia e filamento; o preparo divide pelas peças produzidas", () => {
    const r = calculateCost(
      input({
        filaments: [{ grams: 80, costPerGram: 0.1 }], // 8,00 por mesa
        printMinutes: 240, // 4 h × 0,68 = 2,72 por mesa
        piecesPerPlate: 4,
        quantity: 4,
        prepMinutes: 20, // 10,00 no lote ÷ 4 = 2,50
        postMinutes: 2, // 1,00 por peça
        packagingCost: 1, // por pedido
        failureMarginPct: 10,
      }),
    );
    // peça: 2,00 + 0,68 + 2,50 + 1,00 = 6,18; falha 0,618
    expect(r.piece.subtotal).toBeCloseTo(6.18, 10);
    expect(r.piece.total).toBeCloseTo(6.798, 10);
    expect(r.unit.total).toBeCloseTo(7.798, 10);
    expect(r.pieceMinutes).toBeCloseTo(60, 10);
    expect(r.pieceGrams).toBeCloseTo(20, 10);
    expect(r.plate.total).toBeCloseTo(10.72, 10);
    expect(r.printHours).toBeCloseTo(4, 10);
  });

  it("custo por peça é o da mesa cheia, mesmo com lote que não fecha mesa", () => {
    const r = calculateCost(
      input({
        filaments: [{ grams: 80, costPerGram: 0.1 }],
        printMinutes: 240,
        piecesPerPlate: 4,
        quantity: 5,
        prepMinutes: 20,
        postMinutes: 2,
      }),
    );
    // 2,00 + 0,68 + 10/5 + 1,00 = 5,68
    expect(r.piece.total).toBeCloseTo(5.68, 10);
  });

  it("kit de 1 dá o mesmo custo da fórmula antiga quando não há falha (fichas existentes não mudam)", () => {
    const r = calculateCost(
      input({
        filaments: [
          { grams: 26.71, costPerGram: 0.12 },
          { grams: 3.27, costPerGram: 0.13 },
        ],
        printMinutes: 116,
        piecesPerPlate: 5,
        quantity: 7,
        prepMinutes: 10,
        postMinutes: 3,
        packagingCost: 1.2,
        extras: [{ quantity: 2, unitCost: 0.1 }],
      }),
    );
    // fórmula antiga: lote inteiro ÷ quantidade (mesas proporcionais; embalagem e insumos por peça)
    const q = 7;
    const plates = q / 5;
    const old =
      ((26.71 * 0.12 + 3.27 * 0.13) * plates + (116 / 60) * 0.68 * plates + ((10 + 3 * q) / 60) * 30 + q * (1.2 + 0.2)) / q;
    expect(r.unit.total).toBeCloseTo(old, 10);
  });

  it("insumo por pedido e tempo de embalar entram uma vez por kit, sem falha", () => {
    const r = calculateCost(
      input({
        printMinutes: 60,
        packagingCost: 1,
        packMinutes: 6, // 6 min × 30/60 = 3,00
        extras: [
          { quantity: 1, unitCost: 0.5, perOrder: true }, // etiqueta
          { quantity: 2, unitCost: 0.1 }, // por peça
        ],
        failureMarginPct: 10,
      }),
    );
    expect(r.order).toEqual({ packaging: 1, supplies: 0.5, labor: 3, total: 4.5 });
    expect(r.piece.supplies).toBeCloseTo(0.2, 10);
    expect(kitCost(r, 5)).toBeCloseTo(r.piece.total * 5 + 4.5, 10);
    // mão de obra do kit: a da produção com falha × n (aqui zero) + embalar
    expect(kitLaborCost(r, 5)).toBeCloseTo(3, 10);
  });

  it("itens não configurados entram como zero e geram aviso", () => {
    const r = calculateCost(
      input({
        filaments: [{ grams: 10, costPerGram: null, label: "PLA Azul" }],
        printMinutes: 60,
        prepMinutes: 5,
        printer: { purchasePrice: null, lifetimeHours: null, powerWatts: 100, maintenancePerHour: null },
        energyRateKwh: null,
        laborHourRate: null,
      }),
    );
    expect(r.unit.total).toBe(0);
    expect(r.warnings).toHaveLength(5);
    expect(r.warnings[0]).toContain("PLA Azul");
  });

  it("sem impressora: só avisa uma vez", () => {
    const r = calculateCost(input({ printer: null, printMinutes: 60 }));
    expect(r.warnings).toEqual([
      "Nenhuma impressora selecionada: energia, depreciação e manutenção contadas como R$ 0.",
    ]);
  });

  it.each([
    [{ quantity: 0 }],
    [{ quantity: 1.5 }],
    [{ piecesPerPlate: 0 }],
    [{ printMinutes: -1 }],
    [{ failureMarginPct: 100 }],
    [{ filaments: [{ grams: -5, costPerGram: 0.1 }] }],
  ])("rejeita entrada inválida %o", (overrides) => {
    expect(() => calculateCost(input(overrides))).toThrow(PricingInputError);
  });
});

describe("roundPrice", () => {
  it.each([
    [24.9, "cents_90", 24.9],
    [24.91, "cents_90", 25.9],
    [24.0, "cents_90", 24.9],
    [24.99, "cents_99", 24.99],
    [25.0, "cents_99", 25.99],
    [24.01, "integer", 25],
    [24.0, "integer", 24],
    [24.123, "none", 24.13],
    [24.900000001, "none", 24.9],
  ] as const)("%s com %s → %s", (value, rule, expected) => {
    expect(roundPrice(value, rule)).toBe(expected);
  });
});

describe("preço por canal", () => {
  const shopee: ChannelFees = { commissionPct: 14, extraPct: 6, fixedFee: 4 };

  it("preço sugerido com margem e arredondamento (,90)", () => {
    // (17,116 + 4) ÷ (1 − 0,14 − 0,06 − 0 − 0,30) = 42,232 → 42,90
    const r = suggestPrice(17.116, shopee, 0, 30, "cents_90");
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.rawPrice).toBeCloseTo(42.232, 10);
    expect(r.price).toBe(42.9);
    // taxas: 42,90 × 20% + 4 = 12,58 · lucro: 42,90 − 12,58 − 17,116 = 13,204
    expect(r.channelFees).toBeCloseTo(12.58, 10);
    expect(r.profit).toBeCloseTo(13.204, 10);
    // arredondar para cima nunca reduz a margem desejada
    expect(r.marginPct).toBeGreaterThanOrEqual(30);
  });

  it("imposto entra no denominador e no lucro", () => {
    const r = suggestPrice(10, { commissionPct: null, extraPct: null, fixedFee: null }, 6, 24, "none");
    expect(r.ok && r.price).toBe(14.29); // 10 ÷ 0,70 = 14,2857 → 14,29
    expect(r.ok && r.tax).toBeCloseTo(0.8574, 10);
  });

  it("margem + taxas ≥ 100% é impossível", () => {
    const r = suggestPrice(10, { commissionPct: 20, extraPct: 10, fixedFee: 0 }, 6, 70, "cents_90");
    expect(r).toEqual({
      ok: false,
      error: "Margem + taxas passam de 100%: não existe preço possível.",
      deductionsPct: 106,
    });
    expect(suggestPrice(10, { commissionPct: 50, extraPct: null, fixedFee: null }, 0, 50, "none").ok).toBe(false);
  });

  it("modo inverso: lucro vendendo por R$ 39,90 na Shopee", () => {
    const r = profitAtPrice(39.9, 17.116, shopee, 0);
    expect(r.channelFees).toBeCloseTo(11.98, 10);
    expect(r.profit).toBeCloseTo(10.804, 10);
    expect(r.marginPct).toBeCloseTo((10.804 / 39.9) * 100, 10);
  });

  it("prejuízo aparece como lucro negativo", () => {
    expect(profitAtPrice(15, 17.116, shopee, 0).profit).toBeLessThan(0);
  });

  it("canal configurado = alguma taxa preenchida", () => {
    expect(isChannelConfigured({ commissionPct: null, extraPct: null, fixedFee: null })).toBe(false);
    expect(isChannelConfigured({ commissionPct: 0, extraPct: null, fixedFee: null })).toBe(true);
  });
});

describe("produzir X peças", () => {
  const r = calculateCost(
    input({
      filaments: [{ grams: 80, costPerGram: 0.1 }], // 20 g e R$ 2,00 por peça
      purgeG: 4, // por mesa, a R$ 0,10/g
      printMinutes: 240, // 4 h × 0,68 = 2,72 por mesa
      piecesPerPlate: 4,
      quantity: 5,
      prepMinutes: 20, // 10,00 uma vez
      postMinutes: 2, // 1,00 por peça
    }),
  );

  it("última mesa incompleta conta inteira de tempo e máquina, mas só com as gramas das peças", () => {
    const plan = productionPlan(r, 5);
    expect(plan.plates).toBe(2);
    expect(plan.lastPlatePieces).toBe(1);
    expect(plan.minutes).toBe(480);
    // 5 × 20 g + 2 mesas × 4 g de purga
    expect(plan.grams).toBeCloseTo(108, 10);
    // 2 × (2,72 + 0,40) + 5 × (2,00 + 1,00) + 10,00
    expect(plan.cost).toBeCloseTo(31.24, 10);
    expect(plan.costPerPiece).toBeCloseTo(6.248, 10);
  });

  it("lote que fecha mesas certinho", () => {
    const plan = productionPlan(r, 8);
    expect(plan.plates).toBe(2);
    expect(plan.lastPlatePieces).toBe(4);
    expect(plan.grams).toBeCloseTo(168, 10);
  });

  it("aplica a margem de falha e recusa número inválido", () => {
    const withFailure = calculateCost(input({ printMinutes: 60, failureMarginPct: 10 }));
    expect(productionPlan(withFailure, 1).cost).toBeCloseTo(0.748, 10);
    expect(() => productionPlan(r, 0)).toThrow(PricingInputError);
    expect(() => productionPlan(r, 1.5)).toThrow(PricingInputError);
  });
});

describe("preço do kit", () => {
  // peça R$ 4,00 (só filamento), pedido R$ 2,00 (embalagem); comissão 14% + 6% + R$ 4 fixa; sem imposto; margem 20%
  const r = calculateCost(input({ filaments: [{ grams: 40, costPerGram: 0.1 }], printer: null, packagingCost: 2 }));
  const shopee: ChannelFees = { commissionPct: 14, extraPct: 6, fixedFee: 4 };

  it("custo do kit = custo da peça × n + custos do pedido", () => {
    expect(r.piece.total).toBeCloseTo(4, 10);
    expect(kitCost(r, 1)).toBeCloseTo(6, 10);
    expect(kitCost(r, 3)).toBeCloseTo(14, 10);
    expect(kitCost(r, 5)).toBeCloseTo(22, 10);
  });

  it("taxa fixa e embalagem entram UMA vez por kit", () => {
    // (4 × 5 + 2 + 4) ÷ (1 − 0,20 − 0,20) = 26 ÷ 0,6 = 43,33 → 43,90
    const kit5 = suggestKitPrice(r, 5, shopee, 0, 20, "cents_90");
    if (!kit5.ok) throw new Error("sem preço");
    expect(kit5.rawPrice).toBeCloseTo(43.3333333, 6);
    expect(kit5.price).toBe(43.9);
    // taxas: 43,90 × 20% + 4 (uma vez) = 12,78
    expect(kit5.channelFees).toBeCloseTo(12.78, 10);
    expect(kit5.unitCost).toBeCloseTo(22, 10);
    expect(kit5.profit).toBeCloseTo(43.9 - 12.78 - 22, 10);
    // kit de 1: (6 + 4) ÷ 0,6 = 16,67 → 16,90; 5 kits de 1 pagariam 5 taxas fixas e 5 embalagens
    const kit1 = suggestKitPrice(r, 1, shopee, 0, 20, "cents_90");
    if (!kit1.ok) throw new Error("sem preço");
    expect(kit1.price).toBe(16.9);
    expect(kit5.price).toBeLessThan(kit1.price * 5);
  });

  it("kit de 1 é a conta de sempre (suggestPrice sobre o custo da unidade)", () => {
    expect(suggestKitPrice(r, 1, shopee, 6, 25, "cents_90")).toEqual(suggestPrice(r.unit.total, shopee, 6, 25, "cents_90"));
  });

  it("desconto por peça em relação ao kit de 1", () => {
    expect(perPieceDiscountPct(43.9, 5, 16.9)).toBeCloseTo((1 - 8.78 / 16.9) * 100, 10);
    expect(perPieceDiscountPct(20, 1, 20)).toBeCloseTo(0, 10);
    expect(perPieceDiscountPct(10, 2, 0)).toBeNull();
  });

  it("taxa do pedido de plataforma: fixa por unidade vendida (2 × Kit 5 = 2 taxas)", () => {
    // 2 kits de 43,90 = 87,80 × 20% = 17,56 + 2 × 4
    expect(orderChannelFees(87.8, 2, shopee)).toBeCloseTo(25.56, 10);
    expect(orderChannelFees(43.9, 1, shopee)).toBeCloseTo(12.78, 10);
    expect(orderChannelFees(10, 0, shopee)).toBeCloseTo(6, 10);
  });
});
