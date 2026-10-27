import { z } from "zod";
import { PIX_KEY_TYPES, buildPixPayload, normalizePixKey } from "@/lib/pix";
import { QUOTE_STATUSES, type QuoteTotals, quoteTotals } from "@/lib/quotes";

/**
 * O que o cliente vê de um orçamento: exatamente o formato de get_public_quote.
 * Sem custo nenhum. Página pública, PDF e prévia do painel partem daqui.
 */
const num = z.coerce.number();

export const publicQuoteSchema = z.object({
  number: z.string(),
  status: z.enum(QUOTE_STATUSES),
  revision: z.number().int(),
  created_at: z.string(),
  sent_at: z.string().nullable(),
  revised_at: z.string().nullable(),
  valid_until: z.string().nullable(),
  production_days: z.number().int().nullable(),
  discount_type: z.enum(["amount", "percent"]),
  discount_value: num,
  shipping_cost: num,
  deposit_pct: num.nullable(),
  payment_terms: z.string().nullable(),
  notes: z.string().nullable(),
  approved_at: z.string().nullable(),
  customer_name: z.string().nullable(),
  items: z.array(
    z.object({
      description: z.string(),
      image_path: z.string().nullable(),
      quantity: z.number().int(),
      unit_price: num,
    }),
  ),
  store: z.object({
    name: z.string(),
    whatsapp: z.string().nullable(),
    instagram: z.string().nullable(),
    email: z.string().nullable(),
    city: z.string().nullable(),
    pix_key: z.string().nullable(),
    pix_key_type: z.enum(PIX_KEY_TYPES).nullable(),
    terms: z.string().nullable(),
  }),
});

export type PublicQuote = z.infer<typeof publicQuoteSchema>;

export type QuotePix = {
  /** Pix copia e cola com o valor já preenchido. */
  payload: string;
  amount: number;
  /** "Sinal de 50%" ou "Total". */
  label: string;
  key: string;
};

export type QuoteDocument = PublicQuote & { totals: QuoteTotals; pix: QuotePix | null };

export function toQuoteDocument(q: PublicQuote): QuoteDocument {
  const totals = quoteTotals({
    items: q.items.map((i) => ({ quantity: i.quantity, unitPrice: i.unit_price })),
    discountType: q.discount_type,
    discountValue: q.discount_value,
    shippingCost: q.shipping_cost,
    depositPct: q.deposit_pct,
  });

  let pix: QuotePix | null = null;
  const { pix_key, pix_key_type } = q.store;
  if (pix_key && pix_key_type && totals.pixAmount > 0) {
    const key = normalizePixKey(pix_key, pix_key_type);
    if (key.ok) {
      pix = {
        payload: buildPixPayload({
          key: key.key,
          merchantName: q.store.name,
          merchantCity: q.store.city ?? "",
          amount: totals.pixAmount,
        }),
        amount: totals.pixAmount,
        label: totals.deposit !== null ? `Sinal de ${String(q.deposit_pct).replace(".", ",")}%` : "Total",
        key: pix_key,
      };
    }
  }
  return { ...q, totals, pix };
}

/** Foi editado depois de enviado: a página mostra "atualizado em". */
export function wasRevisedAfterSent(q: Pick<PublicQuote, "sent_at" | "revised_at">): boolean {
  // compara como data: o texto do Postgres pode variar nas casas dos microssegundos
  return q.sent_at !== null && q.revised_at !== null && new Date(q.revised_at) > new Date(q.sent_at);
}
