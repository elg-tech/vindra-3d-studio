import { describe, expect, it } from "vitest";
import { type ContextSpool, type PricingContext, matchSpool, toCostInput } from "@/lib/cost-sheet";
import { calculateCost } from "@/lib/pricing";

const spool = (over: Partial<ContextSpool>): ContextSpool => ({
  id: "s1",
  material: "PLA",
  color_name: "Preto",
  color_hex: "#111111",
  cost_per_gram: 0.1,
  remaining_g: 800,
  status: "in_use",
  brand: null,
  ...over,
});

const ctx: PricingContext = {
  settings: {
    energy_rate_kwh: 0.8,
    labor_hour_rate: 30,
    failure_margin_pct: 10,
    default_margin_pct: 30,
    min_margin_pct: 15,
    tax_pct: 0,
    rounding_rule: "cents_90",
  },
  printers: [
    {
      id: "a1",
      name: "Bambu Lab A1",
      is_default: true,
      purchase_price: 2500,
      lifetime_hours: 5000,
      power_watts: 100,
      maintenance_per_hour: 0.1,
    },
  ],
  channels: [],
  spools: [
    spool({ id: "preto", color_hex: "#111111", cost_per_gram: 0.1 }),
    spool({ id: "branco", color_name: "Branco", color_hex: "#f5f5f5", cost_per_gram: 0.14, status: "sealed" }),
    spool({ id: "branco-uso", color_name: "Branco", color_hex: "#f5f5f5", cost_per_gram: 0.12 }),
    spool({ id: "vazio", color_name: "Vermelho", color_hex: "#ff0000", remaining_g: 0, status: "empty" }),
  ],
  materialAverages: { PLA: 0.11, PETG: 0.13 },
};

describe("toCostInput", () => {
  it("resolve carretel, média do material e impressora", () => {
    const input = toCostInput(
      {
        printerId: "a1",
        printMinutes: 120,
        prepMinutes: 10,
        postMinutes: 5,
        purgeG: 0,
        packagingCost: 1.5,
        quantity: 1,
        piecesPerPlate: 1,
        filaments: [
          { filamentId: "preto", material: "PLA", colorHex: null, grams: 30 },
          { filamentId: null, material: "PETG", colorHex: null, grams: 20 },
          { filamentId: null, material: "TPU", colorHex: null, grams: 5 },
        ],
        extras: [{ supplyId: null, name: "Argola", quantity: 1, unitCost: 0.2 }],
      },
      ctx,
    );
    expect(input.filaments).toEqual([
      { grams: 30, costPerGram: 0.1, label: "PLA Preto" },
      { grams: 20, costPerGram: 0.13, label: "PETG (média)" },
      { grams: 5, costPerGram: null, label: "TPU (média)" },
    ]);
    expect(input.printer?.purchasePrice).toBe(2500);
    expect(input.failureMarginPct).toBe(10);

    // TPU sem custo vira aviso, mas o resto é calculado
    const r = calculateCost(input);
    expect(r.warnings).toHaveLength(1);
    expect(r.unit.filament).toBeCloseTo(3 + 2.6, 10);
  });

  it("impressora inexistente → null", () => {
    const input = toCostInput(
      {
        printerId: "outra",
        printMinutes: 0,
        prepMinutes: 0,
        postMinutes: 0,
        purgeG: 0,
        packagingCost: 0,
        quantity: 1,
        piecesPerPlate: 1,
        filaments: [],
        extras: [],
      },
      ctx,
    );
    expect(input.printer).toBeNull();
  });
});

describe("matchSpool", () => {
  it("escolhe a cor mais próxima do mesmo material", () => {
    expect(matchSpool("PLA", "#000000", ctx.spools)?.id).toBe("preto");
  });

  it("empate de cor: prefere o carretel em uso", () => {
    expect(matchSpool("PLA", "#ffffff", ctx.spools)?.id).toBe("branco-uso");
  });

  it("ignora carretel vazio e cor distante", () => {
    expect(matchSpool("PLA", "#ff0000", ctx.spools)).toBeNull();
  });

  it("outro material não casa", () => {
    expect(matchSpool("PETG", "#000000", ctx.spools)).toBeNull();
  });
});
