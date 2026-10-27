import { FilePlus2, FileText, Search } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { formatCurrency, formatDate } from "@/lib/format";
import { summarizeQuoteRow } from "@/lib/quote-rows";
import { QUOTE_STATUSES, QUOTE_STATUS_LABEL, type QuoteStatus, formatDay } from "@/lib/quotes";
import { createClient } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";
import { QuoteStatusBadge } from "./quote-status-badge";

export const metadata: Metadata = { title: "Orçamentos" };

type Filter = "todos" | QuoteStatus;

export default async function OrcamentosPage({ searchParams }: { searchParams: Promise<{ status?: string; q?: string }> }) {
  const params = await searchParams;
  const filter: Filter = QUOTE_STATUSES.includes(params.status as QuoteStatus) ? (params.status as QuoteStatus) : "todos";
  const q = (params.q ?? "").trim().toLowerCase();

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("quotes")
    .select(
      "id, number, status, valid_until, discount_type, discount_value, shipping_cost, deposit_pct, created_at, customers(name), quote_items(quantity, unit_price)",
    )
    .order("created_at", { ascending: false });
  if (error) throw new Error("Não foi possível carregar os orçamentos.");

  // status efetivo: enviado com validade vencida aparece como expirado
  const rows = data.map((r) => ({ ...r, ...summarizeQuoteRow(r) }));
  const counts = Object.fromEntries(QUOTE_STATUSES.map((s) => [s, rows.filter((r) => r.status === s).length])) as Record<
    QuoteStatus,
    number
  >;
  const visible = rows
    .filter((r) => filter === "todos" || r.status === filter)
    .filter((r) => !q || r.number.toLowerCase().includes(q) || r.customers?.name.toLowerCase().includes(q));

  const newButton = (
    <Button asChild>
      <Link href="/orcamentos/novo">
        <FilePlus2 aria-hidden /> Novo orçamento
      </Link>
    </Button>
  );

  return (
    <div className="grid gap-6">
      <PageHeader title="Orçamentos" description="Envie pelo WhatsApp e acompanhe a aprovação." actions={newButton} />

      {rows.length === 0 ? (
        <EmptyState
          icon={FileText}
          title="Nenhum orçamento ainda"
          description="Monte com produtos do catálogo, fichas da calculadora ou itens avulsos."
          action={newButton}
        />
      ) : (
        <>
          <div className="grid gap-3">
            <nav aria-label="Filtrar por status" className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 md:mx-0 md:flex-wrap md:px-0">
              {(["todos", ...QUOTE_STATUSES] as Filter[]).map((f) => (
                <Link
                  key={f}
                  href={f === "todos" ? "/orcamentos" : `/orcamentos?status=${f}`}
                  aria-current={f === filter ? "page" : undefined}
                  className={cn(
                    "shrink-0 rounded-full border px-3 py-1 text-sm whitespace-nowrap transition-colors",
                    f === filter ? "border-primary bg-primary text-primary-foreground" : "hover:bg-muted",
                  )}
                >
                  {f === "todos" ? "Todos" : QUOTE_STATUS_LABEL[f]}{" "}
                  <span className="tabular-nums opacity-70">{f === "todos" ? rows.length : counts[f]}</span>
                </Link>
              ))}
            </nav>
            <form role="search" className="relative max-w-sm">
              {filter !== "todos" && <input type="hidden" name="status" value={filter} />}
              <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
              <Input
                type="search"
                name="q"
                defaultValue={params.q ?? ""}
                placeholder="Buscar por número ou cliente"
                aria-label="Buscar orçamentos"
                className="pl-8"
              />
            </form>
          </div>

          {visible.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhum orçamento neste filtro.</p>
          ) : (
            <ul className="grid gap-2">
              {visible.map((r) => (
                <li key={r.id}>
                  <Card className="gap-0 py-0 transition-colors hover:border-ring/60">
                    <Link
                      href={`/orcamentos/${r.id}`}
                      className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1 p-3 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none sm:grid-cols-[9rem_minmax(0,1fr)_auto_7rem]"
                    >
                      <span className="font-medium tabular-nums">{r.number}</span>
                      <span className="order-3 col-span-2 truncate text-sm text-muted-foreground sm:order-none sm:col-span-1">
                        {r.customers?.name ?? "Sem cliente"} · {formatDate(r.created_at)}
                        {r.valid_until && (r.status === "sent" || r.status === "expired") && ` · validade ${formatDay(r.valid_until)}`}
                      </span>
                      <QuoteStatusBadge status={r.status} className="justify-self-end" />
                      <span className="order-2 text-right font-medium tabular-nums sm:order-none">{formatCurrency(r.total)}</span>
                    </Link>
                  </Card>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  );
}
