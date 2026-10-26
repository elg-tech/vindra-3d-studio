import { ArrowLeft } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ColorDot } from "@/components/color-dot";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { type FilamentStatus, MOVEMENT_KIND_LABEL, isLowStock, remainingPercent } from "@/lib/filaments";
import { formatCurrency, formatDate, formatDateTime, formatGrams, formatNumber, formatUnitCost } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";
import { FilamentDialog } from "../filament-dialog";
import { FilamentActions } from "./filament-actions";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const supabase = await createClient();
  const { data } = await supabase.from("filaments").select("material, color_name").eq("id", id).maybeSingle();
  return { title: data ? `${data.material} ${data.color_name}` : "Carretel" };
}

export default async function FilamentoPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();

  const supabase = await createClient();
  const [{ data: f }, { data: movements }, { data: brands }] = await Promise.all([
    supabase.from("filaments").select("*, filament_brands(id, name, empty_spool_weight_g)").eq("id", id).maybeSingle(),
    supabase
      .from("filament_movements")
      .select("id, kind, grams, notes, occurred_at")
      .eq("filament_id", id)
      .order("occurred_at", { ascending: false })
      .limit(100),
    supabase.from("filament_brands").select("id, name").order("name"),
  ]);
  if (!f) notFound();

  const status = f.status as FilamentStatus;
  const percent = remainingPercent(f.remaining_g, f.net_weight_g);
  const low = isLowStock(f.remaining_g, f.min_stock_g, status);
  const costPerGram = f.cost_per_gram ?? 0;
  const { filament_brands: brand, ...filament } = f;

  return (
    <div className="grid gap-6">
      <div className="grid gap-3">
        <Button asChild variant="ghost" size="sm" className="w-fit">
          <Link href="/filamentos">
            <ArrowLeft aria-hidden /> Filamentos
          </Link>
        </Button>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="flex items-center gap-3 text-2xl font-semibold tracking-tight md:text-3xl">
            <ColorDot hex={f.color_hex} className="size-7" />
            {f.material} {f.color_name}
          </h1>
          <FilamentDialog filament={filament} brands={brands ?? []} />
        </div>
        <p className="text-sm text-muted-foreground">
          {brand?.name ?? "Sem marca"} · {formatNumber(f.diameter_mm)} mm
          {f.supplier && ` · ${f.supplier}`}
          {f.purchased_at && ` · comprado em ${formatDate(`${f.purchased_at}T12:00:00Z`)}`}
        </p>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Estoque</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4">
            <div className="flex items-baseline justify-between gap-2">
              <p className={cn("text-4xl font-semibold tabular-nums", low && "text-warning")}>
                {formatGrams(f.remaining_g)}
              </p>
              <p className="text-sm text-muted-foreground tabular-nums">
                {Math.round(percent)}% de {formatGrams(f.net_weight_g)}
              </p>
            </div>
            <Progress
              value={percent}
              aria-label={`Restante: ${Math.round(percent)}%`}
              className={cn("h-3", low && "[&>[data-slot=progress-indicator]]:bg-warning")}
            />
            {low && (
              <p className="text-sm text-warning">Abaixo do estoque mínimo de {formatGrams(f.min_stock_g)}.</p>
            )}
            <FilamentActions
              id={f.id}
              status={status}
              remainingG={f.remaining_g}
              brandName={brand?.name ?? null}
              brandEmptySpoolG={brand?.empty_spool_weight_g ?? null}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Custo</CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="grid grid-cols-2 gap-y-2 text-sm">
              <dt className="text-muted-foreground">Preço pago</dt>
              <dd className="text-right tabular-nums">{formatCurrency(f.price_paid)}</dd>
              <dt className="text-muted-foreground">Frete rateado</dt>
              <dd className="text-right tabular-nums">{formatCurrency(f.shipping_cost)}</dd>
              <dt className="border-t pt-2 font-medium">Custo por grama</dt>
              <dd className="border-t pt-2 text-right font-semibold tabular-nums">{formatUnitCost(costPerGram)}</dd>
              <dt className="text-muted-foreground">Valor em estoque</dt>
              <dd className="text-right tabular-nums">{formatCurrency(costPerGram * f.remaining_g)}</dd>
            </dl>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Histórico de movimentações</CardTitle>
        </CardHeader>
        <CardContent className="px-0 sm:px-6">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Data</TableHead>
                <TableHead>Tipo</TableHead>
                <TableHead className="text-right">Gramas</TableHead>
                <TableHead className="hidden sm:table-cell">Observação</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(movements ?? []).map((m) => (
                <TableRow key={m.id}>
                  <TableCell className="whitespace-nowrap tabular-nums">{formatDateTime(m.occurred_at)}</TableCell>
                  <TableCell>
                    {MOVEMENT_KIND_LABEL[m.kind as keyof typeof MOVEMENT_KIND_LABEL] ?? m.kind}
                    {m.notes && <span className="block text-xs text-muted-foreground sm:hidden">{m.notes}</span>}
                  </TableCell>
                  <TableCell
                    className={cn(
                      "text-right font-medium tabular-nums",
                      m.grams > 0 ? "text-success" : "text-foreground",
                    )}
                  >
                    {m.grams > 0 ? "+" : ""}
                    {formatGrams(m.grams)}
                  </TableCell>
                  <TableCell className="hidden max-w-xs truncate text-muted-foreground sm:table-cell">
                    {m.notes ?? "—"}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
