import { ArrowLeft, FilePlus2, MessageCircle } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { formatCurrency, formatDate, formatPhone } from "@/lib/format";
import { ORDER_STATUS_LABEL, type OrderStatus, type PaymentKind, paymentState } from "@/lib/orders";
import { QUOTE_ROW_COLUMNS, summarizeQuoteRow } from "@/lib/quote-rows";
import { whatsappLink } from "@/lib/quotes";
import { createClient } from "@/lib/supabase/server";
import { QuoteStatusBadge } from "../../orcamentos/quote-status-badge";
import { PaymentBadge } from "../../pedidos/order-badges";
import { CustomerDialog } from "../customer-dialog";
import { ConfirmDeleteCustomer } from "./delete-customer";

const isUuid = (id: string) => /^[0-9a-f-]{36}$/i.test(id);

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  if (!isUuid(id)) return { title: "Cliente" };
  const supabase = await createClient();
  const { data } = await supabase.from("customers").select("name").eq("id", id).maybeSingle();
  return { title: data?.name ?? "Cliente" };
}

export default async function ClientePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!isUuid(id)) notFound();
  const supabase = await createClient();
  const [{ data: c }, { data: quotes }, { data: orders }] = await Promise.all([
    supabase.from("customers").select("id, name, whatsapp, instagram, email, city, notes, created_at").eq("id", id).maybeSingle(),
    supabase.from("quotes").select(QUOTE_ROW_COLUMNS).eq("customer_id", id).order("created_at", { ascending: false }),
    supabase
      .from("orders")
      .select("id, number, status, total_amount, created_at, paid_by_platform, order_payments(kind, amount, paid_on)")
      .eq("customer_id", id)
      .order("created_at", { ascending: false }),
  ]);
  if (!c) notFound();

  const rows = (quotes ?? []).map((q) => ({ ...q, ...summarizeQuoteRow(q) }));
  const approvedTotal = rows.filter((r) => r.status === "approved").reduce((s, r) => s + r.total, 0);

  return (
    <div className="grid gap-6">
      <div className="grid gap-3">
        <Button asChild variant="ghost" size="sm" className="w-fit">
          <Link href="/clientes">
            <ArrowLeft aria-hidden /> Clientes
          </Link>
        </Button>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-2xl font-semibold tracking-tight md:text-3xl">{c.name}</h1>
          <div className="flex flex-wrap gap-2">
            <CustomerDialog customer={c} />
            <ConfirmDeleteCustomer id={c.id} name={c.name} />
          </div>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,20rem)_minmax(0,1fr)] lg:items-start">
        <Card>
          <CardHeader>
            <CardTitle>Contato</CardTitle>
            <CardDescription>Cliente desde {formatDate(c.created_at)}</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3 text-sm">
            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2">
              <dt className="text-muted-foreground">WhatsApp</dt>
              <dd className="truncate">{formatPhone(c.whatsapp) ?? "—"}</dd>
              <dt className="text-muted-foreground">Instagram</dt>
              <dd className="truncate">{c.instagram ? `@${c.instagram}` : "—"}</dd>
              <dt className="text-muted-foreground">E-mail</dt>
              <dd className="truncate">{c.email ?? "—"}</dd>
              <dt className="text-muted-foreground">Cidade</dt>
              <dd className="truncate">{c.city ?? "—"}</dd>
            </dl>
            {c.notes && <p className="whitespace-pre-line text-muted-foreground">{c.notes}</p>}
            {c.whatsapp && (
              <Button asChild variant="outline">
                <a href={whatsappLink(c.whatsapp, "")} target="_blank" rel="noopener noreferrer">
                  <MessageCircle aria-hidden /> Abrir conversa
                </a>
              </Button>
            )}
            <div className="rounded-lg bg-muted/50 p-3">
              <p className="text-xs text-muted-foreground">Total em orçamentos aprovados</p>
              <p className="text-xl font-semibold tabular-nums">{formatCurrency(approvedTotal)}</p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center justify-between gap-3">
              Orçamentos
              <Button asChild size="sm">
                <Link href={`/orcamentos/novo?cliente=${c.id}`}>
                  <FilePlus2 aria-hidden /> Novo orçamento
                </Link>
              </Button>
            </CardTitle>
          </CardHeader>
          <CardContent>
            {rows.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nenhum orçamento para este cliente.</p>
            ) : (
              <ul className="divide-y">
                {rows.map((r) => (
                  <li key={r.id}>
                    <Link
                      href={`/orcamentos/${r.id}`}
                      className="flex items-center gap-3 py-2.5 hover:underline focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                    >
                      <span className="min-w-0 flex-1">
                        <span className="block font-medium tabular-nums">{r.number}</span>
                        <span className="text-xs text-muted-foreground">{formatDate(r.created_at)}</span>
                      </span>
                      <QuoteStatusBadge status={r.status} />
                      <span className="w-24 text-right tabular-nums">{formatCurrency(r.total)}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card className="lg:col-start-2">
          <CardHeader>
            <CardTitle>Pedidos</CardTitle>
          </CardHeader>
          <CardContent>
            {(orders ?? []).length === 0 ? (
              <p className="text-sm text-muted-foreground">Nenhum pedido para este cliente.</p>
            ) : (
              <ul className="divide-y">
                {orders?.map((o) => (
                  <li key={o.id}>
                    <Link
                      href={`/pedidos/${o.id}`}
                      className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2.5 hover:underline focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                    >
                      <span className="min-w-0 flex-1">
                        <span className="block font-medium tabular-nums">{o.number}</span>
                        <span className="text-xs text-muted-foreground">
                          {formatDate(o.created_at)} · {ORDER_STATUS_LABEL[o.status as OrderStatus]}
                        </span>
                      </span>
                      {o.status !== "cancelled" && (
                        <PaymentBadge
                          state={paymentState(
                            o.order_payments.map((p) => ({ kind: p.kind as PaymentKind, amount: p.amount, paidOn: p.paid_on })),
                            o.paid_by_platform,
                          )}
                        />
                      )}
                      <span className="w-24 text-right tabular-nums">{formatCurrency(o.total_amount)}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
