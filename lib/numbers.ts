/**
 * Converte texto digitado em número, aceitando o formato brasileiro.
 *   "1.234,56" → 1234.56   "0,85" → 0.85   "0.85" → 0.85   "R$ 12" → 12
 * Retorna null para vazio ou inválido.
 */
export function parseDecimal(input: unknown): number | null {
  if (typeof input === "number") return Number.isFinite(input) ? input : null;
  if (typeof input !== "string") return null;

  let s = input.trim().replace(/^R\$\s*/i, "").replace(/\s|%/g, "");
  if (s === "") return null;

  // pontos só valem como milhar em grupos de 3 dígitos: "1.234", "1.234.567"
  // ("0.125" é decimal: milhar nunca começa com 0)
  const thousands = /^-?[1-9]\d{0,2}(\.\d{3})+$/;
  const commaAt = s.indexOf(",");
  if (commaAt >= 0) {
    // vírgula é o separador decimal
    const intPart = s.slice(0, commaAt);
    if (intPart.includes(".") && !thousands.test(intPart)) return null;
    s = intPart.replace(/\./g, "") + "." + s.slice(commaAt + 1);
  } else if (thousands.test(s)) {
    s = s.replace(/\./g, "");
  }

  if (!/^-?\d*\.?\d+$/.test(s)) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

/** Arredonda para `digits` casas sem o erro clássico de ponto flutuante (1.005 → 1.01). */
export function round(value: number, digits = 2): number {
  const factor = 10 ** digits;
  return Math.round((value + Number.EPSILON) * factor) / factor;
}
