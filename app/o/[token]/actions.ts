"use server";

import { revalidatePath } from "next/cache";
import { isQuoteToken } from "@/lib/quote-loaders";
import { createClient } from "@/lib/supabase/server";

export type ApproveResult = { ok: true } | { ok: false; code: string; message: string };

const MESSAGES: Record<string, string> = {
  quote_outdated: "Este orçamento foi atualizado. Recarregue para ver a versão atual.",
  quote_already_approved: "Este orçamento já foi aprovado.",
  quote_rejected: "Este orçamento foi recusado. Fale com a loja pelo WhatsApp.",
  quote_expired: "A validade deste orçamento acabou. Fale com a loja para renovar.",
  quote_not_sent: "Este orçamento ainda não foi liberado.",
  quote_not_found: "Orçamento não encontrado.",
};

/**
 * Aprovação pelo cliente. Server Action = POST: abrir o link (inclusive o robô de prévia
 * do WhatsApp) nunca aprova nada. A revisão é a que a página mostrou ao cliente.
 */
export async function approveQuote(token: string, revision: number): Promise<ApproveResult> {
  if (!isQuoteToken(token) || !Number.isInteger(revision)) {
    return { ok: false, code: "quote_not_found", message: MESSAGES.quote_not_found };
  }
  const supabase = await createClient();
  const { error } = await supabase.rpc("approve_public_quote", { p_token: token, p_revision: revision });
  if (error) {
    const code = Object.keys(MESSAGES).find((c) => error.message.includes(c)) ?? "unknown";
    return { ok: false, code, message: MESSAGES[code] ?? "Não foi possível aprovar agora. Tente de novo." };
  }
  revalidatePath(`/o/${token}`);
  revalidatePath("/orcamentos", "layout");
  return { ok: true };
}
