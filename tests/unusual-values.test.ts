import { describe, expect, it } from "vitest";
import { unusualValues } from "@/lib/unusual-values";

const normalize = (list: string[]) => list.map((s) => s.replace(/ /g, " "));

describe("unusualValues", () => {
  it("valores normais não geram aviso", () => {
    expect(
      unusualValues({
        energy_rate_kwh: "0,85",
        labor_hour_rate: "25",
        price_paid: "100",
        net_weight_g: "1.000",
        power_watts: "95",
      }),
    ).toEqual([]);
  });

  it("tarifa de energia acima de R$ 3/kWh", () => {
    expect(normalize(unusualValues({ energy_rate_kwh: "1.250" }))).toEqual([
      "Tarifa de energia: R$ 1.250,00/kWh está acima de R$ 3,00/kWh.",
    ]);
  });

  it("preço do carretel acima de R$ 500 ou abaixo de R$ 20", () => {
    expect(normalize(unusualValues({ price_paid: "600" }))).toEqual([
      "Preço do carretel: R$ 600,00 está acima de R$ 500,00.",
    ]);
    expect(normalize(unusualValues({ price_paid: "10" }))).toEqual([
      "Preço do carretel: R$ 10,00 está abaixo de R$ 20,00.",
    ]);
  });

  it("peso, watts e hora de trabalho", () => {
    expect(normalize(unusualValues({ net_weight_g: "10.000", power_watts: "1500", labor_hour_rate: "600" }))).toEqual([
      "Peso líquido: 10.000 g está acima de 5.000 g.",
      "Consumo da impressora: 1.500 W está acima de 1.000 W.",
      "Hora de trabalho: R$ 600,00/h está acima de R$ 500,00/h.",
    ]);
  });

  it("limites exatos não geram aviso", () => {
    expect(unusualValues({ energy_rate_kwh: "3", price_paid: "20", net_weight_g: "5000" })).toEqual([]);
  });

  it("ignora vazio e texto inválido (a validação cuida disso)", () => {
    expect(unusualValues({ energy_rate_kwh: "", price_paid: "abc" })).toEqual([]);
  });
});
