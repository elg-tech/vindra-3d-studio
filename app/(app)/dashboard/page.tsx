import { ArrowDownRight, ArrowUpRight, ChevronRight, CircleAlert, CircleCheck, TriangleAlert } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { channelColor } from "@/lib/dashboard";
import { loadDashboard } from "@/lib/dashboard-loaders";
import { changePct, dreCosts, dreMarginPct, monthLabel, shiftMonth } from "@/lib/finance";
import { formatCurrency, formatGrams, formatNumber } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";
import { BarList } from "./bar-list";
import { RevenueChart } from "./revenue-chart";

export const metadata: Metadata = { title: "Dashboard" };

const pct = (n: number) => `${formatNumber(Math.round(n * 10) / 10)}%`;

type Kpi = {
  label: string;
  value: string;
  /** Variação contra o mês anterior: em % ou em pontos percentuais. */
  change?: { value: number | null; unit: "%" | "p.p." };
  hint?: string;
  negative?: boolean;
};

export default async function DashboardPage() {
  const d = await loadDashboard(await createClient());
  const { dre, previousDre } = d.kpis;
  const previousName = monthLabel(shiftMonth(d.month, -1)).split(" ")[0];
  const margin = dreMarginPct(dre);
  const previousMargin = dreMarginPct(previousDre);
  const { approval, grams, hours } = d.kpis;

  const kpis: Kpi[] = [
    { label: "Faturamento", value: formatCurrency(dre.revenue), change: { value: changePct(dre.revenue, previousDre.revenue), unit: "%" } },
    { label: "Custos", value: formatCurrency(dreCosts(dre)), change: { value: changePct(dreCosts(dre), dreCosts(previousDre)), unit: "%" } },
    {
      label: "Lucro líquido",
      value: formatCurrency(dre.netProfit),
      change: { value: changePct(dre.netProfit, previousDre.netProfit), unit: "%" },
      negative: dre.netProfit < 0,
    },
    {
      label: "Margem média",
      value: margin === null ? "—" : pct(margin),
      change: { value: margin !== null && previousMargin !== null ? margin - previousMargin : null, unit: "p.p." },
      negative: margin !== null && margin < 0,
    },
    { label: "A receber", value: formatCurrency(d.kpis.receivable), hint: "restantes de pedidos com sinal pago" },
    { label: "Pedidos em andamento", value: formatNumber(d.kpis.inProgress), hint: "agora" },
    { label: "Orçamentos pendentes", value: formatNumber(d.kpis.pendingQuotes), hint: "enviados, aguardando resposta" },
    {
      label: "Aprovação de orçamentos",
      value: approval.current === null ? "—" : pct(approval.current),
      change: { value: approval.current !== null && approval.previous !== null ? approval.current - approval.previous : null, unit: "p.p." },
      hint: approval.current === null ? "nenhum enviado no mês" : undefined,
    },
    { label: "Filamento consumido", value: formatGrams(grams.current), change: { value: changePct(grams.current, grams.previous), unit: "%" } },
    {
      label: "Horas de impressora",
      value: `${formatNumber(hours.current)} h`,
      change: { value: changePct(hours.current, hours.previous), unit: "%" },
    },
  ];

  return (
    <div className="grid gap-6">
      <PageHeader title="Dashboard" description={`Resumo de ${monthLabel(d.month)}, comparado com ${previousName}.`} />

      <ul className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
        {kpis.map((k) => (
          <KpiTile key={k.label} kpi={k} previousName={previousName} />
        ))}
      </ul>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Faturamento x lucro</CardTitle>
            <CardDescription>Últimos 12 meses, pelo mês em que cada pedido ficou pago.</CardDescription>
          </CardHeader>
          <CardContent>
            <RevenueChart data={d.series} />
          </CardContent>
        </Card>
        <AlertsCard alerts={d.alerts} />
      </div>

      <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle>Vendas por canal</CardTitle>
            <CardDescription>Faturamento do mês.</CardDescription>
          </CardHeader>
          <CardContent>
            <BarList
              empty="Nenhum pedido pago no mês."
              rows={d.channels.map((c) => ({
                key: c.name,
                label: c.name,
                detail: c.orders === 1 ? "1 pedido" : `${c.orders} pedidos`,
                value: c.revenue,
                display: formatCurrency(c.revenue),
                color: channelColor(c.kind),
              }))}
            />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Top 5 produtos por lucro</CardTitle>
            <CardDescription>Pedidos pagos no mês, já sem taxas, imposto e custo.</CardDescription>
          </CardHeader>
          <CardContent>
            <BarList
              empty="Nenhum produto vendido no mês."
              rows={d.products.map((p) => ({
                key: p.key,
                label: p.name,
                detail: `${p.quantity} un.`,
                value: p.profit,
                display: formatCurrency(p.profit),
                color: "var(--chart-1)",
              }))}
            />
          </CardContent>
        </Card>
        <Card className="md:col-span-2 xl:col-span-1">
          <CardHeader>
            <CardTitle>Consumo de filamento</CardTitle>
            <CardDescription>Baixas e falhas do mês, por material e cor.</CardDescription>
          </CardHeader>
          <CardContent>
            <BarList
              empty="Nenhuma baixa de filamento no mês."
              rows={d.usage.slice(0, 8).map((u) => ({
                key: `${u.material}-${u.colorName}`,
                label: `${u.material} ${u.colorName}`,
                value: u.grams,
                display: formatGrams(u.grams),
                swatch: u.colorHex,
              }))}
            />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function KpiTile({ kpi, previousName }: { kpi: Kpi; previousName: string }) {
  const change = kpi.change?.value;
  return (
    <li className="grid content-start gap-1 rounded-xl border p-3.5">
      <p className="text-xs text-muted-foreground">{kpi.label}</p>
      <p className={cn("text-lg font-semibold tabular-nums sm:text-xl", kpi.negative && "text-destructive")}>{kpi.value}</p>
      {kpi.change ? (
        change === null || change === undefined ? (
          <p className="text-xs text-muted-foreground">sem base em {previousName}</p>
        ) : (
          <p className="flex items-center gap-0.5 text-xs text-muted-foreground tabular-nums">
            {change >= 0 ? <ArrowUpRight className="size-3.5" aria-hidden /> : <ArrowDownRight className="size-3.5" aria-hidden />}
            <span>
              {change >= 0 ? "+" : "−"}
              {kpi.change.unit === "%" ? pct(Math.abs(change)) : `${formatNumber(Math.round(Math.abs(change) * 10) / 10)} p.p.`} vs. {previousName}
            </span>
          </p>
        )
      ) : (
        kpi.hint && <p className="text-xs text-muted-foreground">{kpi.hint}</p>
      )}
    </li>
  );
}

function AlertsCard({ alerts }: { alerts: Awaited<ReturnType<typeof loadDashboard>>["alerts"] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Alertas</CardTitle>
        <CardDescription>{alerts.length === 0 ? "Nada pedindo atenção." : `${alerts.length} ${alerts.length === 1 ? "item" : "itens"} pedindo atenção.`}</CardDescription>
      </CardHeader>
      <CardContent>
        {alerts.length === 0 ? (
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <CircleCheck className="size-4 text-success" aria-hidden /> Estoque, prazos, orçamentos e margens em dia.
          </p>
        ) : (
          <ul className="-mx-2 grid max-h-80 gap-0.5 overflow-y-auto">
            {alerts.map((a) => (
              <li key={a.id}>
                <Link href={a.href} className="flex items-center gap-2.5 rounded-lg px-2 py-2 text-sm hover:bg-accent">
                  {a.tone === "danger" ? (
                    <CircleAlert className="size-4 shrink-0 text-destructive" aria-label="Urgente" />
                  ) : (
                    <TriangleAlert className="size-4 shrink-0 text-warning" aria-label="Atenção" />
                  )}
                  <span className="grid min-w-0 flex-1">
                    <span className="truncate font-medium">{a.title}</span>
                    <span className="truncate text-xs text-muted-foreground">{a.detail}</span>
                  </span>
                  <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
