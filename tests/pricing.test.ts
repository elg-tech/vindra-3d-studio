import { describe, expect, it } from "vitest";
import {
  type ChannelFees,
  type CostInput,
  PricingInputError,
  calculateCost,
  depreciationPerHour,
  energyCostPerHour,
  isChannelConfigured,
  profitAtPrice,
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
  it("peça simples (fórmula do prompt, conferida à mão)", () => {
    const r = calculateCost(
      input({
        filaments: [{ grams: 50, costPerGram: 0.1 }], // R$ 5,00
        printMinutes: 120, // 2 h → energia 0,16 · depreciação 1,00 · manutenção 0,20
        prepMinutes: 10,
        postMinutes: 5, // 15 min × R$ 30/h = 7,50
        packagingCost: 1.5,
        extras: [{ quantity: 1, unitCost: 0.2 }], // insumos 1,70
        failureMarginPct: 10,
      }),
    );
    expect(r.unit.filament).toBeCloseTo(5, 10);
    expect(r.unit.energy).toBeCloseTo(0.16, 10);
    expect(r.unit.depreciation).toBeCloseTo(1, 10);
    expect(r.unit.maintenance).toBeCloseTo(0.2, 10);
    expect(r.unit.labor).toBeCloseTo(7.5, 10);
    expect(r.unit.supplies).toBeCloseTo(1.7, 10);
    expect(r.unit.subtotal).toBeCloseTo(15.56, 10);
    expect(r.unit.failure).toBeCloseTo(1.556, 10);
    expect(r.unit.total).toBeCloseTo(17.116, 10);
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

  it("várias peças por mesa dividem tempo, energia e filamento", () => {
    const r = calculateCost(
      input({
        filaments: [{ grams: 80, costPerGram: 0.1 }], // 8,00 por mesa
        printMinutes: 240, // 4 h × 0,68 = 2,72 por mesa
        piecesPerPlate: 4,
        quantity: 4,
        prepMinutes: 20, // uma vez
        postMinutes: 2, // por peça → (20 + 8) min × 30/60 = 14,00
        packagingCost: 1, // 4,00
        failureMarginPct: 10,
      }),
    );
    expect(r.lot.subtotal).toBeCloseTo(28.72, 10);
    expect(r.lot.total).toBeCloseTo(31.592, 10);
    expect(r.unit.total).toBeCloseTo(7.898, 10);
    expect(r.printHours).toBeCloseTo(4, 10);
  });

  it("quantidade que não fecha mesa conta a última proporcionalmente", () => {
    const r = calculateCost(
      input({
        filaments: [{ grams: 80, costPerGram: 0.1 }],
        printMinutes: 240,
        piecesPerPlate: 4,
        quantity: 5, // 1,25 mesa
        prepMinutes: 20,
        postMinutes: 2,
        packagingCost: 1,
      }),
    );
    // filamento 10,00 + máquina 3,40 + mão de obra 15,00 + embalagem 5,00
    expect(r.lot.subtotal).toBeCloseTo(33.4, 10);
    expect(r.printHours).toBeCloseTo(5, 10);
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
