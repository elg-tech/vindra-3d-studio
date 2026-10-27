import { type DiscountType, type QuoteStatus, effectiveStatus, quoteTotals } from "@/lib/quotes";

/** Linha de orçamento como vem das listas (quotes com quote_items(quantity, unit_price)). */
export type QuoteRow = {
  id: string;
  number: string;
  status: string;
  valid_until: string | null;
  discount_type: string;
  discount_value: number;
  shipping_cost: number;
  deposit_pct: number | null;
  quote_items: { quantity: number; unit_price: number }[];
};

export const QUOTE_ROW_COLUMNS =
  "id, number, status, valid_until, discount_type, discount_value, shipping_cost, deposit_pct, created_at, quote_items(quantity, unit_price)";

/** Total e status efetivo (enviado vencido = expirado) para listas. */
export function summarizeQuoteRow(q: QuoteRow) {
  const totals = quoteTotals({
    items: q.quote_items.map((i) => ({ quantity: i.quantity, unitPrice: i.unit_price })),
    discountType: q.discount_type as DiscountType,
    discountValue: q.discount_value,
    shippingCost: q.shipping_cost,
    depositPct: q.deposit_pct,
  });
  return { total: totals.total, status: effectiveStatus(q.status as QuoteStatus, q.valid_until) };
}
