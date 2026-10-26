import { describe, expect, it } from "vitest";
import { depreciationPerHour, energyCostPerHour } from "@/lib/pricing";

describe("depreciationPerHour", () => {
  it("A1 de R$ 2.500 com 5.000 h de vida útil = R$ 0,50/h", () => {
    expect(depreciationPerHour(2500, 5000)).toBeCloseTo(0.5, 10);
  });

  it("rejeita vida útil zero", () => {
    expect(() => depreciationPerHour(2500, 0)).toThrow();
  });
});

describe("energyCostPerHour", () => {
  it("95 W a R$ 0,85/kWh = R$ 0,08075/h", () => {
    expect(energyCostPerHour(95, 0.85)).toBeCloseTo(0.08075, 10);
  });
});
