"use client";

import { Bar, BarChart, CartesianGrid, Cell, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { MonthPoint } from "@/lib/dashboard";
import { monthLabel, monthShortLabel, monthTitle } from "@/lib/finance";
import { formatCurrency } from "@/lib/format";

const compact = new Intl.NumberFormat("pt-BR", { notation: "compact", maximumFractionDigits: 1 });

const SERIES = [
  { key: "revenue", label: "Faturamento", color: "var(--chart-5)" },
  { key: "netProfit", label: "Lucro líquido", color: "var(--chart-1)" },
] as const;

/** Faturamento x lucro líquido dos últimos 12 meses (prejuízo em vermelho). */
export function RevenueChart({ data }: { data: MonthPoint[] }) {
  return (
    <div className="grid gap-3">
      <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground" aria-hidden>
        {SERIES.map((s) => (
          <li key={s.key} className="flex items-center gap-1.5">
            <span className="size-2.5 rounded-sm" style={{ background: s.color }} />
            {s.label}
          </li>
        ))}
        <li className="flex items-center gap-1.5">
          <span className="size-2.5 rounded-sm bg-destructive" />
          Prejuízo
        </li>
      </ul>
      <div className="h-64" aria-hidden>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={data}
            margin={{ top: 4, right: 4, bottom: 0, left: 0 }}
            barGap={2}
            barCategoryGap="20%"
            // gráfico só visual (aria-hidden); o leitor de tela usa a tabela. Sem isso o SVG recebe foco.
            accessibilityLayer={false}
          >
            <CartesianGrid vertical={false} stroke="var(--border)" />
            <XAxis
              dataKey="month"
              tickFormatter={monthShortLabel}
              tickLine={false}
              axisLine={false}
              tick={{ fill: "var(--muted-foreground)", fontSize: 11 }}
              interval="preserveStartEnd"
              minTickGap={8}
            />
            <YAxis
              width={44}
              tickFormatter={(v: number) => compact.format(v)}
              tickLine={false}
              axisLine={false}
              tick={{ fill: "var(--muted-foreground)", fontSize: 11 }}
            />
            <ReferenceLine y={0} stroke="var(--muted-foreground)" strokeOpacity={0.5} />
            <Tooltip
              cursor={{ fill: "var(--muted)", opacity: 0.6 }}
              content={({ active, payload, label }) =>
                active && payload?.length ? (
                  <div className="grid gap-1 rounded-lg border bg-popover px-3 py-2 text-xs text-popover-foreground shadow-md">
                    <p className="font-medium">{monthTitle(String(label))}</p>
                    {SERIES.map((s) => {
                      const value = Number(payload.find((p) => p.dataKey === s.key)?.value ?? 0);
                      return (
                        <p key={s.key} className="flex items-center justify-between gap-4">
                          <span className="flex items-center gap-1.5">
                            <span
                              className="size-2 rounded-sm"
                              style={{ background: s.key === "netProfit" && value < 0 ? "var(--destructive)" : s.color }}
                            />
                            {s.label}
                          </span>
                          <span className="tabular-nums">{formatCurrency(value)}</span>
                        </p>
                      );
                    })}
                  </div>
                ) : null
              }
            />
            <Bar dataKey="revenue" fill="var(--chart-5)" radius={[4, 4, 0, 0]} maxBarSize={22} />
            <Bar dataKey="netProfit" fill="var(--chart-1)" radius={[4, 4, 0, 0]} maxBarSize={22}>
              {data.map((d) => (
                <Cell key={d.month} fill={d.netProfit < 0 ? "var(--destructive)" : "var(--chart-1)"} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
      <table className="sr-only">
        <caption>Faturamento e lucro líquido por mês</caption>
        <thead>
          <tr>
            <th scope="col">Mês</th>
            <th scope="col">Faturamento</th>
            <th scope="col">Lucro líquido</th>
          </tr>
        </thead>
        <tbody>
          {data.map((d) => (
            <tr key={d.month}>
              <th scope="row">{monthLabel(d.month)}</th>
              <td>{formatCurrency(d.revenue)}</td>
              <td>{formatCurrency(d.netProfit)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
