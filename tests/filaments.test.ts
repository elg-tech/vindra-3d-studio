import { describe, expect, it } from "vitest";
import {
  averageCostByMaterial,
  costPerGram,
  isLowStock,
  lastCostByMaterial,
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

  it("material sem estoque fica de fora (não vira média nem zero)", () => {
    const avg = averageCostByMaterial([
      { material: "TPU", cost_per_gram: 0.2, remaining_g: 0, net_weight_g: 500 },
      { material: "TPU", cost_per_gram: 0.3, remaining_g: 0, net_weight_g: 1500 },
    ]);
    expect(avg.has("TPU")).toBe(false);
  });
});

describe("lastCostByMaterial", () => {
  const spool = (material: string, cost: number, purchased_at: string | null, created_at: string) => ({
    material,
    cost_per_gram: cost,
    purchased_at,
    created_at,
  });

  it("usa o carretel comprado mais recentemente", () => {
    const last = lastCostByMaterial([
      spool("TPU", 0.2, "2026-03-10", "2026-10-01T10:00:00Z"),
      spool("TPU", 0.3, "2026-08-05", "2026-09-01T10:00:00Z"),
      spool("PLA", 0.1, "2026-01-01", "2026-01-01T10:00:00Z"),
    ]);
    expect(last.get("TPU")).toBe(0.3);
    expect(last.get("PLA")).toBe(0.1);
  });

  it("sem data de compra, vale a data de cadastro; empate decide pelo cadastro", () => {
    const last = lastCostByMaterial([
      spool("PETG", 0.12, "2026-05-01", "2026-05-01T08:00:00Z"),
      spool("PETG", 0.15, null, "2026-06-01T08:00:00Z"),
      spool("ABS", 0.2, "2026-07-01", "2026-07-01T08:00:00Z"),
      spool("ABS", 0.25, "2026-07-01", "2026-07-01T09:00:00Z"),
    ]);
    expect(last.get("PETG")).toBe(0.15);
    expect(last.get("ABS")).toBe(0.25);
  });

  it("material nunca comprado não aparece", () => {
    expect(lastCostByMaterial([]).has("ASA")).toBe(false);
  });
});
