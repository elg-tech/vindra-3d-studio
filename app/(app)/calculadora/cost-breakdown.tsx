"use client";

import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table";
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
    <div className="grid items-center gap-4 sm:grid-cols-[180px_1fr]">
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

      <Table aria-label="Composição do custo por peça">
        <TableHeader>
          <TableRow>
            <TableHead>Item</TableHead>
            <TableHead className="text-right">R$/peça</TableHead>
            <TableHead className="w-12 text-right">%</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((r) => (
            <TableRow key={r.label} className={r.indent ? "text-muted-foreground" : undefined}>
              <TableCell className={r.indent ? "py-1 pl-8 text-xs" : "py-1.5"}>
                <span className="flex items-center gap-2">
                  {r.color && <span className="size-2.5 shrink-0 rounded-sm" style={{ background: r.color }} />}
                  {r.label}
                </span>
              </TableCell>
              <TableCell className={r.indent ? "py-1 text-right text-xs tabular-nums" : "py-1.5 text-right tabular-nums"}>
                {formatCurrency(r.value)}
              </TableCell>
              <TableCell className={r.indent ? "py-1 text-right text-xs tabular-nums" : "py-1.5 text-right tabular-nums"}>
                {pct(r.value, unit.total)}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
        <TableFooter>
          <TableRow>
            <TableCell className="font-semibold">Custo por peça</TableCell>
            <TableCell className="text-right font-semibold tabular-nums">{formatCurrency(unit.total)}</TableCell>
            <TableCell />
          </TableRow>
        </TableFooter>
      </Table>
    </div>
  );
}
