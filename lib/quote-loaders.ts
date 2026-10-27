import "server-only";
import { type PublicQuote, type QuoteDocument, publicQuoteSchema, toQuoteDocument } from "@/lib/quote-document";
import { type QuoteStatus, effectiveStatus } from "@/lib/quotes";
import type { createClient } from "@/lib/supabase/server";

type Supabase = Awaited<ReturnType<typeof createClient>>;

export const isQuoteToken = (token: string) => /^[0-9a-f]{64}$/.test(token);

/** Página pública e PDF do cliente: só o que get_public_quote libera (sem rascunho, sem custo). */
export async function loadPublicQuote(supabase: Supabase, token: string): Promise<QuoteDocument | null> {
  if (!isQuoteToken(token)) return null;
  const { data, error } = await supabase.rpc("get_public_quote", { p_token: token });
  if (error || !data) return null;
  const parsed = publicQuoteSchema.safeParse(data);
  if (!parsed.success) throw new Error("Orçamento com formato inesperado.");
  return toQuoteDocument(parsed.data);
}

/** Painel: o mesmo documento montado das tabelas do dono, inclusive rascunho (prévia e PDF). */
export async function loadOwnerQuoteDocument(supabase: Supabase, id: string): Promise<QuoteDocument | null> {
  const [{ data: q }, { data: s }] = await Promise.all([
    supabase
      .from("quotes")
      .select(
        "*, customers(name), quote_items(description, image_path, quantity, unit_price, sort_order, product_variants(image_path, products(image_path)))",
      )
      .eq("id", id)
      .maybeSingle(),
    supabase
      .from("settings")
      .select("store_name, store_whatsapp, store_instagram, store_email, store_city, pix_key, pix_key_type, default_quote_terms")
      .single(),
  ]);
  if (!q || !s) return null;

  const doc: PublicQuote = {
    number: q.number,
    status: effectiveStatus(q.status as QuoteStatus, q.valid_until),
    revision: q.revision,
    created_at: q.created_at,
    sent_at: q.sent_at,
    revised_at: q.revised_at,
    valid_until: q.valid_until,
    production_days: q.production_days,
    discount_type: q.discount_type as PublicQuote["discount_type"],
    discount_value: q.discount_value,
    shipping_cost: q.shipping_cost,
    deposit_pct: q.deposit_pct,
    payment_terms: q.payment_terms,
    notes: q.notes,
    approved_at: q.approved_at,
    customer_name: q.customers?.name ?? null,
    items: [...q.quote_items]
      .sort((a, b) => a.sort_order - b.sort_order)
      .map((i) => ({
        description: i.description,
        image_path: i.image_path ?? i.product_variants?.image_path ?? i.product_variants?.products?.image_path ?? null,
        quantity: i.quantity,
        unit_price: i.unit_price,
      })),
    store: {
      name: s.store_name,
      whatsapp: s.store_whatsapp,
      instagram: s.store_instagram,
      email: s.store_email,
      city: s.store_city,
      pix_key: s.pix_key,
      pix_key_type: s.pix_key_type as PublicQuote["store"]["pix_key_type"],
      terms: s.default_quote_terms,
    },
  };
  return toQuoteDocument(doc);
}
