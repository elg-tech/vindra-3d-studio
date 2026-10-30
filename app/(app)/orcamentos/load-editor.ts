import "server-only";
import { publicEnv } from "@/lib/env";
import { loadQuoteCatalog } from "@/lib/quote-catalog";
import type { createClient } from "@/lib/supabase/server";

type Supabase = Awaited<ReturnType<typeof createClient>>;

/** Tudo que o editor de orçamento precisa além do próprio orçamento. */
export async function loadEditorData(supabase: Supabase) {
  const [catalog, { data: customers }, { data: settings }, { data: supplies }] = await Promise.all([
    loadQuoteCatalog(supabase),
    supabase.from("customers").select("id, name, whatsapp").order("name"),
    supabase.from("settings").select("store_name, store_whatsapp, pix_key, pix_key_type, quote_validity_days").single(),
    supabase.from("supplies").select("id, name, unit, unit_cost, is_packaging").order("name"),
  ]);

  const warnings = [
    !settings?.pix_key || !settings.pix_key_type
      ? "Chave Pix (ou o tipo dela) não configurada: a página e o PDF saem sem Pix. Configure em Configurações → Dados da loja."
      : null,
    !settings?.store_whatsapp ? "WhatsApp da loja não configurado: o cliente não terá o botão “Falar no WhatsApp”." : null,
  ].filter((w): w is string => w !== null);

  return {
    catalog,
    customers: customers ?? [],
    supplies: supplies ?? [],
    storeName: settings?.store_name ?? "Vindra 3D",
    validityDays: settings?.quote_validity_days ?? 7,
    siteUrl: publicEnv.NEXT_PUBLIC_SITE_URL.replace(/\/$/, ""),
    warnings,
  };
}
