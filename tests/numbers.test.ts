import { describe, expect, it } from "vitest";
import { parseDecimal, round } from "@/lib/numbers";

describe("parseDecimal", () => {
  it.each([
    ["0,85", 0.85],
    ["0.85", 0.85],
    ["1.234,56", 1234.56],
    ["1.234", 1234],
    ["1.234.567", 1234567],
    // ponto + exatamente 3 dígitos, sem vírgula e sem 0 antes = milhar; senão, decimal
    ["1.000", 1000],
    ["1.010", 1010],
    ["2.500", 2500],
    ["1.000,50", 1000.5],
    ["0.125", 0.125],
    ["0,125", 0.125],
    ["12.5", 12.5],
    ["1.2", 1.2],
    ["R$ 12,90", 12.9],
    ["10%", 10],
    ["  100  ", 100],
    ["-5,5", -5.5],
    [42, 42],
  ])("%s → %s", (input, expected) => {
    expect(parseDecimal(input)).toBe(expected);
  });

  it.each(["", "   ", "abc", "1,2,3", "1..2", null, undefined, Number.NaN])("%s é inválido", (input) => {
    expect(parseDecimal(input)).toBeNull();
  });
});

describe("round", () => {
  it("corrige o erro de ponto flutuante", () => {
    expect(round(1.005)).toBe(1.01);
    expect(round(0.1 + 0.2)).toBe(0.3);
  });

  it("respeita as casas pedidas", () => {
    expect(round(0.123456, 4)).toBe(0.1235);
  });
});
