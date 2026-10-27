import { quotePdfFilename, renderQuotePdf } from "@/lib/quote-pdf";
import { loadOwnerQuoteDocument } from "@/lib/quote-loaders";
import { createClient } from "@/lib/supabase/server";

/** PDF pelo painel (inclusive rascunho). O RLS garante que só o dono lê o orçamento. */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return new Response("Orçamento não encontrado.", { status: 404 });
  const q = await loadOwnerQuoteDocument(await createClient(), id);
  if (!q) return new Response("Orçamento não encontrado.", { status: 404 });

  const pdf = await renderQuotePdf(q);
  return new Response(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${quotePdfFilename(q)}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
