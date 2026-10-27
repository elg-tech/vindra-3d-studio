import { AlertTriangle, CalendarClock, CheckCircle2, Download, Hammer, MessageCircle, XCircle } from "lucide-react";
import type { Metadata } from "next";
import Image from "next/image";
import { notFound } from "next/navigation";
import QRCode from "qrcode";
import { cache } from "react";
import { CopyButton } from "@/components/copy-button";
import { Logo } from "@/components/logo";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatCurrency, formatDateTime } from "@/lib/format";
import { productImageUrl } from "@/lib/products";
import { wasRevisedAfterSent } from "@/lib/quote-document";
import { loadPublicQuote } from "@/lib/quote-loaders";
import { formatDay, whatsappLink } from "@/lib/quotes";
import { createClient } from "@/lib/supabase/server";
import { ApproveButton } from "./approve-button";
import { Countdown } from "./countdown";

// metadados e página leem o mesmo orçamento uma vez só por requisição (somente leitura)
const getQuote = cache(async (token: string) => loadPublicQuote(await createClient(), token));

export async function generateMetadata({ params }: { params: Promise<{ token: string }> }): Promise<Metadata> {
  const { token } = await params;
  const q = await getQuote(token);
  if (!q) return { title: "Orçamento", robots: { index: false } };
  const title = `Orçamento ${q.number} · ${q.store.name}`;
  const description = `Total ${formatCurrency(q.totals.total)}${q.valid_until ? ` · válido até ${formatDay(q.valid_until)}` : ""}`;
  return {
    title: { absolute: title },
    description,
    robots: { index: false, follow: false },
    openGraph: { title, description, type: "website" },
  };
}

export default async function OrcamentoPublicoPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const q = await getQuote(token);
  if (!q) notFound();

  const { totals, pix, store } = q;
  const canApprove = q.status === "sent";
  const showPix = pix !== null && (q.status === "sent" || q.status === "approved");
  const qrSvg = showPix ? await QRCode.toString(pix.payload, { type: "svg", margin: 1, errorCorrectionLevel: "M" }) : null;
  const terms = q.payment_terms ?? store.terms;
  const talkLink = whatsappLink(store.whatsapp, `Olá! Tenho uma dúvida sobre o orçamento ${q.number}.`);

  return (
    <main className="mx-auto grid w-full max-w-2xl gap-5 px-4 pt-6 pb-[calc(2rem+env(safe-area-inset-bottom))]">
      <header className="flex items-center justify-between gap-4">
        <Logo className="w-20" priority />
        <div className="text-right">
          <p className="text-xs text-muted-foreground">Orçamento</p>
          <h1 className="text-xl font-semibold tracking-tight tabular-nums">{q.number}</h1>
          {q.customer_name && <p className="text-sm text-muted-foreground">para {q.customer_name}</p>}
        </div>
      </header>

      <StatusBanner status={q.status} approvedAt={q.approved_at} />
      {wasRevisedAfterSent(q) && q.revised_at && q.status === "sent" && (
        <p className="rounded-lg border bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
          Atualizado em {formatDateTime(q.revised_at)}.
        </p>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Itens</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4">
          <ul className="grid gap-3">
            {q.items.map((item, i) => {
              const image = productImageUrl(item.image_path);
              return (
                <li key={i} className="flex gap-3">
                  {image && (
                    <div className="relative size-16 shrink-0 overflow-hidden rounded-lg bg-muted">
                      <Image src={image} alt="" fill sizes="64px" className="object-cover" priority={i < 2} />
                    </div>
                  )}
                  <div className="grid min-w-0 flex-1 content-center gap-0.5">
                    <p className="font-medium break-words">{item.description}</p>
                    <p className="text-sm text-muted-foreground tabular-nums">
                      {item.quantity} × {formatCurrency(item.unit_price)}
                    </p>
                  </div>
                  <p className="self-center font-medium tabular-nums">{formatCurrency(item.quantity * item.unit_price)}</p>
                </li>
              );
            })}
          </ul>

          <dl className="grid grid-cols-[1fr_auto] gap-y-1 border-t pt-3 text-sm">
            <dt className="text-muted-foreground">Subtotal</dt>
            <dd className="text-right tabular-nums">{formatCurrency(totals.subtotal)}</dd>
            {totals.discount > 0 && (
              <>
                <dt className="text-muted-foreground">Desconto</dt>
                <dd className="text-right tabular-nums">−{formatCurrency(totals.discount)}</dd>
              </>
            )}
            {totals.shipping > 0 && (
              <>
                <dt className="text-muted-foreground">Frete</dt>
                <dd className="text-right tabular-nums">{formatCurrency(totals.shipping)}</dd>
              </>
            )}
            <dt className="pt-2 text-base font-semibold">Total</dt>
            <dd className="pt-2 text-right text-2xl font-semibold tracking-tight tabular-nums">{formatCurrency(totals.total)}</dd>
            {totals.deposit !== null && (
              <>
                <dt className="text-muted-foreground">Sinal ({String(q.deposit_pct).replace(".", ",")}%)</dt>
                <dd className="text-right font-medium tabular-nums">{formatCurrency(totals.deposit)}</dd>
              </>
            )}
          </dl>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="grid gap-3 text-sm">
          {q.valid_until && (
            <p className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <CalendarClock className="size-4 text-muted-foreground" aria-hidden />
              <span>Válido até {formatDay(q.valid_until)}</span>
              {q.status === "sent" && (
                <span className="text-muted-foreground">
                  · <Countdown validUntil={q.valid_until} />
                </span>
              )}
            </p>
          )}
          {q.production_days !== null && (
            <p className="flex items-center gap-2">
              <Hammer className="size-4 text-muted-foreground" aria-hidden />
              Produção em até {q.production_days} {q.production_days === 1 ? "dia útil" : "dias úteis"} após a aprovação.
            </p>
          )}
          {terms && (
            <div className="grid gap-1">
              <p className="font-medium">Condições de pagamento</p>
              <p className="whitespace-pre-line text-muted-foreground">{terms}</p>
            </div>
          )}
          {q.notes && (
            <div className="grid gap-1">
              <p className="font-medium">Observações</p>
              <p className="whitespace-pre-line text-muted-foreground">{q.notes}</p>
            </div>
          )}
        </CardContent>
      </Card>

      {canApprove && (
        <ApproveButton token={token} revision={q.revision} number={q.number} totalLabel={formatCurrency(totals.total)} />
      )}

      {showPix && pix && qrSvg && (
        <Card>
          <CardHeader>
            <CardTitle>Pagar com Pix</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4">
            <p className="text-sm">
              {pix.label}: <strong className="tabular-nums">{formatCurrency(pix.amount)}</strong>
            </p>
            <div className="flex flex-col items-center gap-4 sm:flex-row sm:items-start">
              {/* QR em fundo branco: alguns leitores não reconhecem QR claro sobre escuro */}
              <div
                role="img"
                aria-label={`QR Code do Pix de ${formatCurrency(pix.amount)}`}
                className="size-48 shrink-0 rounded-lg bg-white p-2 [&_svg]:size-full"
                dangerouslySetInnerHTML={{ __html: qrSvg }}
              />
              <div className="grid w-full min-w-0 gap-2">
                <p className="text-sm text-muted-foreground">
                  Aponte a câmera do app do banco ou use o Pix copia e cola. O valor já vem preenchido.
                </p>
                <CopyButton value={pix.payload} label="Copiar Pix copia e cola" copiedMessage="Pix copia e cola copiado." variant="default" />
                <CopyButton value={pix.key} label="Copiar só a chave Pix" copiedMessage="Chave Pix copiada." />
                <p className="break-all text-xs text-muted-foreground">Chave: {pix.key}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-2 sm:grid-cols-2">
        {store.whatsapp && (
          <Button asChild variant="outline" size="lg">
            <a href={talkLink} target="_blank" rel="noopener noreferrer">
              <MessageCircle aria-hidden /> Falar no WhatsApp
            </a>
          </Button>
        )}
        <Button asChild variant="outline" size="lg">
          <a href={`/o/${token}/pdf`} download={`orcamento-${q.number}.pdf`}>
            <Download aria-hidden /> Baixar PDF
          </a>
        </Button>
      </div>

      <footer className="grid gap-1 border-t pt-4 text-center text-xs text-muted-foreground">
        <p className="font-medium text-foreground">{store.name}</p>
        <p>{[store.city, store.instagram && `@${store.instagram}`, store.email].filter(Boolean).join(" · ")}</p>
      </footer>
    </main>
  );
}

function StatusBanner({ status, approvedAt }: { status: string; approvedAt: string | null }) {
  if (status === "approved") {
    return (
      <p role="status" className="flex items-center gap-2 rounded-lg border border-success/40 bg-success/10 px-3 py-2 text-sm">
        <CheckCircle2 className="size-4 shrink-0 text-success" aria-hidden />
        Orçamento aprovado{approvedAt ? ` em ${formatDateTime(approvedAt)}` : ""}. Obrigado!
      </p>
    );
  }
  if (status === "expired") {
    return (
      <p role="status" className="flex items-center gap-2 rounded-lg border border-warning/40 bg-warning/10 px-3 py-2 text-sm">
        <AlertTriangle className="size-4 shrink-0 text-warning" aria-hidden />
        A validade deste orçamento acabou. Fale com a loja para renovar.
      </p>
    );
  }
  if (status === "rejected") {
    return (
      <p role="status" className="flex items-center gap-2 rounded-lg border px-3 py-2 text-sm text-muted-foreground">
        <XCircle className="size-4 shrink-0" aria-hidden />
        Este orçamento foi recusado.
      </p>
    );
  }
  return null;
}
