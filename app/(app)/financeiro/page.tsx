import { ChevronLeft, ChevronRight, Download, TriangleAlert, Wallet } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import {
  type Dre,
  type FinanceEntry,
  breakEven,
  buildDre,
  cashEntries,
  cashTotals,
  currentMonth,
  entriesOfMonth,
  isMonth,
  monthTitle,
  ordersPaidSince,
  shiftMonth,
} from "@/lib/finance";
import { loadFinance } from "@/lib/finance-loaders";
import { formatCurrency, formatNumber } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";
import { EntryActions } from "./entry-actions";
import { TransactionDialog } from "./transaction-dialog";

export const metadata: Metadata = { title: "Financeiro" };

const pct = (n: number) => `${formatNumber(Math.round(n * 10) / 10)}%`;
const SOURCE_LABEL: Record<FinanceEntry["source"], string> = {
  payment: "Pedido",
  platform: "Pedido",
  filament: "Carretel",
  manual: "Manual",
};

export default async function FinanceiroPage({ searchParams }: { searchParams: Promise<{ mes?: string }> }) {
  const { mes } = await searchParams;
  const today = currentMonth();
  const month = isMonth(mes) ? mes : today;

  const data = await loadFinance(await createClient());
  const entries = entriesOfMonth(cashEntries(data), month);
  const totals = cashTotals(entries);
  const dre = buildDre({ month, ...data });
  const be = breakEven({
    month,
    transactions: data.transactions,
    recentOrders: ordersPaidSince(data.orders, 90),
    taxPct: data.taxPct,
    billed: dre.revenue,
  });

  const monthLink = (m: string) => (m === today ? "/financeiro" : `/financeiro?mes=${m}`);
  const next = shiftMonth(month, 1);

  return (
    <div className="grid gap-6">
      <PageHeader title="Financeiro" description="Caixa, DRE e ponto de equilíbrio do mês." actions={<TransactionDialog />} />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <nav aria-label="Mês" className="flex items-center gap-1">
          <Button asChild variant="outline" size="icon">
            <Link href={monthLink(shiftMonth(month, -1))} aria-label="Mês anterior">
              <ChevronLeft aria-hidden />
            </Link>
          </Button>
          <h2 className="min-w-44 text-center font-medium">{monthTitle(month)}</h2>
          {next <= today ? (
            <Button asChild variant="outline" size="icon">
              <Link href={monthLink(next)} aria-label="Próximo mês">
                <ChevronRight aria-hidden />
              </Link>
            </Button>
          ) : (
            <Button variant="outline" size="icon" disabled aria-label="Próximo mês">
              <ChevronRight aria-hidden />
            </Button>
          )}
        </nav>
        <Button asChild variant="outline">
          <a href={`/financeiro/csv?mes=${month}`} download>
            <Download aria-hidden /> Exportar CSV
          </a>
        </Button>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <Stat label="Entradas" value={totals.income} hint={totals.fees > 0 ? `já sem ${formatCurrency(totals.fees)} de taxas` : "líquidas das taxas"} />
        <Stat label="Saídas" value={-totals.expenses} hint="carretéis e despesas" />
        <Stat label="Saldo do mês" value={totals.balance} emphasis />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <DreCard dre={dre} taxPct={data.taxPct} month={month} />
        <Card>
          <CardHeader>
            <CardTitle>Ponto de equilíbrio</CardTitle>
            <CardDescription>Quanto faturar no mês para pagar as despesas fixas.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 text-sm">
            {be.fixed === 0 ? (
              <p className="text-muted-foreground">Marque despesas como &quot;fixa mensal&quot; (aluguel, internet, assinaturas) para calcular.</p>
            ) : be.required === null ? (
              <p className="text-muted-foreground">
                {be.marginPct === null
                  ? "Ainda não há pedidos pagos nos últimos 90 dias para medir a margem de contribuição."
                  : `A margem de contribuição dos últimos 90 dias está em ${pct(be.marginPct)}: as vendas não cobrem os custos variáveis.`}
              </p>
            ) : (
              <>
                <div className="grid gap-1">
                  <p className="text-muted-foreground">Faturamento necessário</p>
                  <p className="text-2xl font-semibold tabular-nums">{formatCurrency(be.required)}</p>
                </div>
                <div className="grid gap-1.5">
                  <Progress value={(be.progress ?? 0) * 100} className="h-2" aria-label="Faturado do necessário" />
                  <p className="tabular-nums">
                    Faturado {formatCurrency(be.billed)} · <strong>{pct((be.progress ?? 0) * 100)}</strong>
                    {be.billed < be.required && <span className="text-muted-foreground"> · faltam {formatCurrency(be.required - be.billed)}</span>}
                  </p>
                </div>
              </>
            )}
            {be.fixed > 0 && (
              <p className="text-xs text-muted-foreground">
                Despesas fixas {formatCurrency(be.fixed)}
                {be.fixedFromPreviousMonth && " (do mês anterior: ainda não há fixas lançadas neste mês)"}
                {be.marginPct !== null && ` ÷ margem de contribuição de ${pct(be.marginPct)} (pedidos pagos nos últimos 90 dias)`}.
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Lançamentos</CardTitle>
          <CardDescription>
            Pagamentos de pedidos e carretéis entram sozinhos; corrija-os no pedido ou no carretel.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {entries.length === 0 ? (
            <EmptyState icon={Wallet} title="Nenhum lançamento no mês" description="Pagamentos recebidos, carretéis comprados e despesas aparecem aqui." />
          ) : (
            <ul className="divide-y">
              {entries.map((e) => (
                <EntryRow key={e.id} entry={e} />
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function Stat({ label, value, hint, emphasis }: { label: string; value: number; hint?: string; emphasis?: boolean }) {
  return (
    <div className={cn("grid gap-1 rounded-xl border p-4", emphasis && "bg-accent/40")}>
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className={cn("text-xl font-semibold tabular-nums", value < 0 && emphasis && "text-destructive")}>{formatCurrency(value)}</p>
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

function EntryRow({ entry: e }: { entry: FinanceEntry }) {
  const [, m, d] = e.date.split("-");
  return (
    <li className="flex items-center gap-3 py-3">
      <span className="w-11 shrink-0 text-sm tabular-nums text-muted-foreground">
        {d}/{m}
      </span>
      <div className="grid min-w-0 flex-1 gap-0.5">
        {e.href ? (
          <Link href={e.href} className="truncate font-medium hover:underline">
            {e.description}
          </Link>
        ) : (
          <span className="truncate font-medium">{e.description}</span>
        )}
        <span className="text-xs text-muted-foreground">
          {e.category} · {SOURCE_LABEL[e.source]}
          {e.manual?.isFixed && " · fixa mensal"}
        </span>
      </div>
      <div className="grid shrink-0 text-right">
        <span className="font-medium tabular-nums">
          {e.kind === "income" ? "+" : "−"}
          {formatCurrency(Math.abs(e.net))}
        </span>
        {e.fee > 0 && <span className="text-xs tabular-nums text-muted-foreground">taxa {formatCurrency(e.fee)}</span>}
      </div>
      {e.manual ? <EntryActions transaction={e.manual} /> : <span className="hidden w-[4.5rem] shrink-0 sm:block" aria-hidden />}
    </li>
  );
}

function DreCard({ dre, taxPct, month }: { dre: Dre; taxPct: number; month: string }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>DRE do mês</CardTitle>
        <CardDescription>
          {dre.orders === 0
            ? "Nenhum pedido ficou pago neste mês."
            : `${dre.orders} ${dre.orders === 1 ? "pedido ficou pago" : "pedidos ficaram pagos"} no mês. Compras de carretel ficam fora: o filamento já está no custo dos produtos.`}
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-3">
        {dre.ordersMissingCost > 0 && (
          <Link
            href={`/financeiro/sem-custo?mes=${month}`}
            className="flex items-start gap-2 rounded-lg border border-warning/40 bg-warning/10 p-2.5 text-sm hover:bg-warning/20 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
          >
            <TriangleAlert className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden />
            <span>
              {dre.ordersMissingCost} {dre.ordersMissingCost === 1 ? "pedido tem" : "pedidos têm"} item sem custo (contado como R$ 0).{" "}
              <span className="font-medium underline underline-offset-4">Ver e definir o custo</span>
            </span>
          </Link>
        )}
        <dl className="grid text-sm">
          <Line label="Faturamento bruto" value={dre.revenue} strong />
          <Line label="Taxas dos canais" value={-dre.fees} />
          <Line label={dre.taxSource === "rate" ? `Imposto (${pct(taxPct)})` : "Imposto (lançamentos “Impostos”)"} value={-dre.tax} />
          <Line label="Frete repassado" value={-dre.shipping} />
          <Line label="Custo dos produtos" value={-dre.productsCost} hint={dre.labor > 0 ? `inclui ${formatCurrency(dre.labor)} da sua hora` : undefined} />
          <Line label="Falhas de impressão" value={-dre.failures} />
          <Line label="Lucro bruto" value={dre.grossProfit} total />
          <Line label="Outras receitas" value={dre.otherIncome} />
          <Line label="Despesas" value={-dre.expenses} />
          <Line label="Lucro líquido" value={dre.netProfit} total />
          <Line label="Lucro líquido sem a sua hora" value={dre.netProfitWithoutLabor} strong hint="somando de volta a mão de obra do custo" />
        </dl>
      </CardContent>
    </Card>
  );
}

function Line({ label, value, hint, strong, total }: { label: string; value: number; hint?: string; strong?: boolean; total?: boolean }) {
  return (
    <div className={cn("flex items-baseline justify-between gap-3 py-1.5", total && "mt-1 border-t pt-2.5 font-semibold", strong && "font-medium")}>
      <dt className="grid">
        {label}
        {hint && <span className="text-xs font-normal text-muted-foreground">{hint}</span>}
      </dt>
      <dd className={cn("tabular-nums", (total || strong) && value < 0 && "text-destructive")}>
        {value === 0 ? formatCurrency(0) : formatCurrency(value)}
      </dd>
    </div>
  );
}
