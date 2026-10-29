import type { ChannelFees } from "@/lib/pricing";

/**
 * Taxa por forma de pagamento (Venda direta).
 * Cada pagamento paga a taxa da forma usada: sinal no Pix e restante no crédito = taxa só no restante.
 * Shopee, TikTok e outros canais continuam com a taxa do pedido (comissão + adicional + fixa).
 */

/** Formas que se escolhem ao marcar um pagamento. */
export const PAYMENT_METHODS = ["pix", "cash", "debit", "credit"] as const;
export type SelectablePaymentMethod = (typeof PAYMENT_METHODS)[number];
/** "card" só existe nos registros anteriores à separação em débito e crédito. */
export type PaymentMethod = SelectablePaymentMethod | "card";

export const PAYMENT_METHOD_LABEL: Record<PaymentMethod, string> = {
  pix: "Pix",
  cash: "Dinheiro",
  debit: "Cartão de débito",
  credit: "Cartão de crédito",
  card: "Cartão",
};

export type MethodRate = { pct: number; fixed: number };
export type PaymentRates = Record<SelectablePaymentMethod, MethodRate>;

/** Colunas do canal com as taxas por forma (para os selects). */
export const PAYMENT_RATE_COLUMNS = "pix_pct, pix_fixed, cash_pct, cash_fixed, debit_pct, debit_fixed, credit_pct, credit_fixed";

export type PaymentRateRow = Record<`${SelectablePaymentMethod}_${"pct" | "fixed"}`, number>;

export function paymentRates(row: PaymentRateRow): PaymentRates {
  return {
    pix: { pct: row.pix_pct, fixed: row.pix_fixed },
    cash: { pct: row.cash_pct, fixed: row.cash_fixed },
    debit: { pct: row.debit_pct, fixed: row.debit_fixed },
    credit: { pct: row.credit_pct, fixed: row.credit_fixed },
  };
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Taxa de um pagamento: valor × % + taxa fixa da forma usada, em centavos.
 * Nunca passa do próprio valor. "card" (registro antigo, sem débito/crédito) não tem taxa conhecida: null.
 */
export function paymentFee(amount: number, method: PaymentMethod, rates: PaymentRates): number | null {
  if (method === "card") return null;
  if (amount <= 0) return 0;
  const { pct, fixed } = rates[method];
  return Math.min(round2((amount * pct) / 100 + fixed), round2(amount));
}

/** Soma das taxas dos pagamentos recebidos: é a taxa do pedido de Venda direta. */
export function orderPaymentFees(payments: { amount: number; paidOn: string | null; method: PaymentMethod | null }[], rates: PaymentRates): number {
  return round2(
    payments.reduce((s, p) => (p.paidOn && p.method ? s + (paymentFee(p.amount, p.method, rates) ?? 0) : s), 0),
  );
}

/** Taxas de uma forma no formato da calculadora (preço sugerido e lucro). */
export function methodChannelFees(rate: MethodRate): ChannelFees {
  return { commissionPct: null, extraPct: rate.pct, fixedFee: rate.fixed };
}

/** "Cartão de crédito 4,99% + R$ 0,50" */
export function rateLabel(method: SelectablePaymentMethod, rate: MethodRate): string {
  const parts = [`${String(rate.pct).replace(".", ",")}%`];
  if (rate.fixed > 0) parts.push(`R$ ${rate.fixed.toFixed(2).replace(".", ",")}`);
  return `${PAYMENT_METHOD_LABEL[method]} ${parts.join(" + ")}`;
}
