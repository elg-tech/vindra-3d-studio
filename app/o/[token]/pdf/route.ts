import { quotePdfFilename, renderQuotePdf } from "@/lib/quote-pdf";
import { loadPublicQuote } from "@/lib/quote-loaders";
import { createClient } from "@/lib/supabase/server";

/** PDF para o cliente: o mesmo que a página pública mostra (sem rascunho, sem custo). Só leitura. */
export async function GET(_request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const q = await loadPublicQuote(await createClient(), token);
  if (!q) return new Response("Orçamento não encontrado.", { status: 404 });

  const pdf = await renderQuotePdf(q);
  return new Response(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${quotePdfFilename(q)}"`,
      "Cache-Control": "private, no-store",
      "X-Robots-Tag": "noindex",
    },
  });
}
