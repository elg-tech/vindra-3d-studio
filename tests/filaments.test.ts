import { describe, expect, it } from "vitest";
import {
  averageCostByMaterial,
  costPerGram,
  isLowStock,
  remainingPercent,
  weighSpool,
} from "@/lib/filaments";

describe("costPerGram", () => {
  it("PLA 1 kg a R$ 100 custa R$ 0,10/g", () => {
    expect(costPerGram(100, 0, 1000)).toBeCloseTo(0.1, 10);
  });

  it("inclui o frete rateado", () => {
    expect(costPerGram(100, 15, 1000)).toBeCloseTo(0.115, 10);
  });

  it("rejeita peso zero", () => {
    expect(() => costPerGram(100, 0, 0)).toThrow();
  });
});

describe("weighSpool", () => {
  it("desconta o carretel vazio e calcula o ajuste", () => {
    // balança 830 g, carretel vazio 250 g → 580 g; saldo era 600 g → ajuste -20 g
    expect(weighSpool(830, 250, 600)).toEqual({ remainingG: 580, adjustmentG: -20 });
  });

  it("nunca fica negativo", () => {
    expect(weighSpool(200, 250, 50)).toEqual({ remainingG: 0, adjustmentG: -50 });
  });

  it("pode corrigir para cima", () => {
    expect(weighSpool(1000, 250, 700)).toEqual({ remainingG: 750, adjustmentG: 50 });
  });
});

describe("remainingPercent", () => {
  it("calcula e limita entre 0 e 100", () => {
    expect(remainingPercent(250, 1000)).toBe(25);
    expect(remainingPercent(1200, 1000)).toBe(100);
    expect(remainingPercent(-5, 1000)).toBe(0);
    expect(remainingPercent(10, 0)).toBe(0);
  });
});

describe("isLowStock", () => {
  it("alerta no mínimo ou abaixo, exceto carretel que acabou", () => {
    expect(isLowStock(100, 100, "in_use")).toBe(true);
    expect(isLowStock(101, 100, "in_use")).toBe(false);
    expect(isLowStock(0, 100, "empty")).toBe(false);
  });
});

describe("averageCostByMaterial", () => {
  it("pondera pelos gramas em estoque", () => {
    const avg = averageCostByMaterial([
      { material: "PLA", cost_per_gram: 0.1, remaining_g: 750, net_weight_g: 1000 },
      { material: "PLA", cost_per_gram: 0.14, remaining_g: 250, net_weight_g: 1000 },
      { material: "PETG", cost_per_gram: 0.12, remaining_g: 500, net_weight_g: 1000 },
    ]);
    // (0,10×750 + 0,14×250) / 1000 = 0,11
    expect(avg.get("PLA")).toBeCloseTo(0.11, 10);
    expect(avg.get("PETG")).toBeCloseTo(0.12, 10);
  });

  it("ignora carretéis vazios quando há estoque", () => {
    const avg = averageCostByMaterial([
      { material: "PLA", cost_per_gram: 0.1, remaining_g: 500, net_weight_g: 1000 },
      { material: "PLA", cost_per_gram: 0.5, remaining_g: 0, net_weight_g: 1000 },
    ]);
    expect(avg.get("PLA")).toBeCloseTo(0.1, 10);
  });

  it("sem estoque, usa o peso comprado", () => {
    const avg = averageCostByMaterial([
      { material: "TPU", cost_per_gram: 0.2, remaining_g: 0, net_weight_g: 500 },
      { material: "TPU", cost_per_gram: 0.3, remaining_g: 0, net_weight_g: 1500 },
    ]);
    // (0,2×500 + 0,3×1500) / 2000 = 0,275
    expect(avg.get("TPU")).toBeCloseTo(0.275, 10);
  });
});
