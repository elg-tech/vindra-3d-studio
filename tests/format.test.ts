import { describe, expect, it } from "vitest";
import {
  formatCurrency,
  formatDate,
  formatDateTime,
  formatGrams,
  formatNumber,
  formatUnitCost,
} from "@/lib/format";

// Intl usa espaço não separável entre "R$" e o valor.
const normalize = (s: string) => s.replace(/ /g, " ");

describe("formatCurrency", () => {
  it("formata em reais", () => {
    expect(normalize(formatCurrency(1234.56))).toBe("R$ 1.234,56");
  });

  it("arredonda para centavos", () => {
    expect(normalize(formatCurrency(0.005))).toBe("R$ 0,01");
  });
});

describe("formatNumber", () => {
  it("usa vírgula decimal", () => {
    expect(formatNumber(1234.5)).toBe("1.234,5");
  });
});

describe("formatDate", () => {
  it("converte UTC para o fuso de São Paulo", () => {
    // 02:00 UTC do dia 2 ainda é dia 1 em São Paulo (UTC-3).
    expect(formatDate("2026-01-02T02:00:00Z")).toBe("01/01/2026");
  });

  it("formata data e hora", () => {
    expect(formatDateTime("2026-01-02T15:30:00Z")).toBe("02/01/2026 12:30");
  });
});

describe("formatUnitCost", () => {
  it("mostra 4 casas", () => {
    expect(normalize(formatUnitCost(0.115))).toBe("R$ 0,1150");
  });
});

describe("formatGrams", () => {
  it("usa separador pt-BR", () => {
    expect(formatGrams(1234.5)).toBe("1.234,5 g");
  });
});
