import { formatCurrency, formatNumber } from "@/lib/format";
import { parseDecimal } from "@/lib/numbers";

/**
 * Limites de "valor fora do normal". Não bloqueiam: só pedem confirmação antes de salvar,
 * para pegar erros de digitação (ex.: "1.250" lido como mil duzentos e cinquenta).
 * Ajuste aqui se a sua realidade mudar.
 */
export const UNUSUAL_LIMITS = {
  energy_rate_kwh: { label: "Tarifa de energia", unit: "currency_kwh", max: 3 },
  labor_hour_rate: { label: "Hora de trabalho", unit: "currency_h", max: 500 },
  price_paid: { label: "Preço do carretel", unit: "currency", min: 20, max: 500 },
  net_weight_g: { label: "Peso líquido", unit: "grams", max: 5000 },
  power_watts: { label: "Consumo da impressora", unit: "watts", max: 1000 },
} as const satisfies Record<string, { label: string; unit: Unit; min?: number; max?: number }>;

type Unit = "currency" | "currency_kwh" | "currency_h" | "grams" | "watts";
export type UnusualField = keyof typeof UNUSUAL_LIMITS;

function formatValue(value: number, unit: Unit): string {
  switch (unit) {
    case "currency":
      return formatCurrency(value);
    case "currency_kwh":
      return `${formatCurrency(value)}/kWh`;
    case "currency_h":
      return `${formatCurrency(value)}/h`;
    case "grams":
      return `${formatNumber(value)} g`;
    case "watts":
      return `${formatNumber(value)} W`;
  }
}

/** Lista os valores fora do normal entre os campos informados (texto ou número). */
export function unusualValues(values: Partial<Record<UnusualField, unknown>>): string[] {
  const warnings: string[] = [];
  for (const field of Object.keys(values) as UnusualField[]) {
    const limit: { label: string; unit: Unit; min?: number; max?: number } = UNUSUAL_LIMITS[field];
    if (!limit) continue;
    const n = parseDecimal(values[field]);
    if (n === null) continue;

    if (limit.max !== undefined && n > limit.max) {
      warnings.push(
        `${limit.label}: ${formatValue(n, limit.unit)} está acima de ${formatValue(limit.max, limit.unit)}.`,
      );
    } else if (limit.min !== undefined && n < limit.min) {
      warnings.push(
        `${limit.label}: ${formatValue(n, limit.unit)} está abaixo de ${formatValue(limit.min, limit.unit)}.`,
      );
    }
  }
  return warnings;
}
