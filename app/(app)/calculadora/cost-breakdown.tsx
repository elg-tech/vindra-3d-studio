"use client";

import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import { formatCurrency } from "@/lib/format";
import type { CostParts } from "@/lib/pricing";

/** 5 fatias (máquina agrupa energia + depreciação + manutenção); a tabela detalha tudo. */
function slices(unit: CostParts) {
  return [
    { key: "filament", label: "Filamento", value: unit.filament, color: "var(--cost-1)" },
    {
      key: "machine",
      label: "Máquina",
      value: unit.energy + unit.depreciation + unit.maintenance,
      color: "var(--cost-2)",
    },
    { key: "labor", label: "Mão de obra", value: unit.labor, color: "var(--cost-3)" },
    { key: "supplies", label: "Insumos", value: unit.supplies, color: "var(--cost-4)" },
    { key: "failure", label: "Margem de falha", value: unit.failure, color: "var(--cost-5)" },
  ];
}

const pct = (part: number, total: number) =>
  total > 0 ? `${((part / total) * 100).toLocaleString("pt-BR", { maximumFractionDigits: 0 })}%` : "—";

export function CostBreakdown({ unit }: { unit: CostParts }) {
  const data = slices(unit);
  const visible = data.filter((d) => d.value > 0);

  const rows: { label: string; value: number; color?: string; indent?: boolean }[] = [
    { label: "Filamento", value: unit.filament, color: data[0].color },
    { label: "Máquina", value: data[1].value, color: data[1].color },
    { label: "Energia", value: unit.energy, indent: true },
    { label: "Depreciação", value: unit.depreciation, indent: true },
    { label: "Manutenção", value: unit.maintenance, indent: true },
    { label: "Mão de obra", value: unit.labor, color: data[2].color },
    { label: "Insumos e embalagem", value: unit.supplies, color: data[3].color },
    { label: "Margem de falha", value: unit.failure, color: data[4].color },
  ];

  return (
    // a coluna de resultado é estreita no desktop: gráfico e tabela lado a lado só se o card tiver espaço
    <div className="@container">
      <div className="grid items-center gap-4 @lg:grid-cols-[180px_1fr]">
        <div className="relative mx-auto size-[180px]" aria-hidden={visible.length === 0}>
          {visible.length > 0 ? (
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={visible}
                  dataKey="value"
                  nameKey="label"
                  innerRadius={58}
                  outerRadius={86}
                  paddingAngle={visible.length > 1 ? 2 : 0}
                  stroke="var(--card)"
                  strokeWidth={2}
                  isAnimationActive={false}
                >
                  {visible.map((d) => (
                    <Cell key={d.key} fill={d.color} />
                  ))}
                </Pie>
                <Tooltip
                  cursor={false}
                  content={({ active, payload }) => {
                    const item = payload?.[0];
                    if (!active || !item) return null;
                    return (
                      <div className="rounded-md border bg-popover px-3 py-2 text-xs text-popover-foreground shadow-md">
                        <p className="font-medium">{item.name}</p>
                        <p className="tabular-nums">
                          {formatCurrency(Number(item.value))} · {pct(Number(item.value), unit.total)}
                        </p>
                      </div>
                    );
                  }}
                />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <div className="size-full rounded-full border-[28px] border-muted" />
          )}
          <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center">
            <span className="text-xs text-muted-foreground">por peça</span>
            <span className="text-lg font-semibold tabular-nums">{formatCurrency(unit.total)}</span>
          </div>
        </div>
  
        {/* table-fixed: o nome do item encurta, a coluna de valores nunca sai do card */}
        <table aria-label="Composição do custo por peça" className="w-full table-fixed text-sm">
          <colgroup>
            <col />
            <col className="w-24" />
            <col className="w-11" />
          </colgroup>
          <thead className="border-b text-xs text-muted-foreground">
            <tr>
              <th scope="col" className="pb-1.5 text-left font-medium">
                Item
              </th>
              <th scope="col" className="pb-1.5 text-right font-medium">
                R$/peça
              </th>
              <th scope="col" className="pb-1.5 text-right font-medium">
                %
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.label} className={r.indent ? "text-xs text-muted-foreground" : "border-t first:border-t-0"}>
                <th scope="row" className={r.indent ? "py-0.5 pl-[1.125rem] text-left font-normal" : "py-1.5 text-left font-normal"}>
                  <span className="flex items-center gap-2">
                    {r.color && <span className="size-2.5 shrink-0 rounded-sm" style={{ background: r.color }} />}
                    <span className="min-w-0 truncate">{r.label}</span>
                  </span>
                </th>
                <td className="text-right tabular-nums">{formatCurrency(r.value)}</td>
                <td className="text-right tabular-nums">{pct(r.value, unit.total)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot className="border-t font-semibold">
            <tr>
              <th scope="row" className="pt-2 text-left">
                Custo por peça
              </th>
              <td className="pt-2 text-right tabular-nums">{formatCurrency(unit.total)}</td>
              <td />
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}
