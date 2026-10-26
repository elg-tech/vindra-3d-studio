/**
 * Cálculos de custo e preço. Funções puras, cobertas por testes em tests/pricing.test.ts.
 * A calculadora completa (Fase 5) é construída sobre estes blocos.
 */

/** Depreciação da impressora por hora de uso = valor pago ÷ vida útil (h). */
export function depreciationPerHour(purchasePrice: number, lifetimeHours: number): number {
  if (lifetimeHours <= 0) throw new Error("Vida útil precisa ser maior que zero.");
  return purchasePrice / lifetimeHours;
}

/** Custo de energia por hora = (watts ÷ 1000) × tarifa (R$/kWh). */
export function energyCostPerHour(powerWatts: number, tariffPerKwh: number): number {
  return (powerWatts / 1000) * tariffPerKwh;
}
