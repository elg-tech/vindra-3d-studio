import { AlertTriangle, Spool } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { ColorDot } from "@/components/color-dot";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import {
  FILAMENT_STATUS_LABEL,
  type FilamentStatus,
  averageCostByMaterial,
  isLowStock,
  remainingPercent,
} from "@/lib/filaments";
import { formatCurrency, formatGrams, formatUnitCost } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";
import { FilamentDialog } from "./filament-dialog";

export const metadata: Metadata = { title: "Filamentos" };

export default async function FilamentosPage() {
  const supabase = await createClient();
  const [{ data: filaments, error }, { data: brands }] = await Promise.all([
    supabase
      .from("filaments")
      .select("*, filament_brands(name)")
      .order("status")
      .order("material")
      .order("color_name"),
    supabase.from("filament_brands").select("id, name").order("name"),
  ]);
  if (error) throw new Error("Não foi possível carregar os filamentos.");

  const list = filaments ?? [];
  const active = list.filter((f) => f.status !== "empty");
  const finished = list.filter((f) => f.status === "empty");
  const lowStock = active.filter((f) => isLowStock(f.remaining_g, f.min_stock_g, f.status as FilamentStatus));
  const averages = [...averageCostByMaterial(list)].sort(([a], [b]) => a.localeCompare(b));
  const totalGrams = active.reduce((sum, f) => sum + f.remaining_g, 0);

  return (
    <div className="grid gap-6">
      <PageHeader
        title="Filamentos"
        description={`${active.length} carretel(is) em estoque · ${formatGrams(Math.round(totalGrams))}`}
        actions={<FilamentDialog brands={brands ?? []} />}
      />

      {list.length === 0 ? (
        <EmptyState
          icon={Spool}
          title="Nenhum carretel cadastrado"
          description="Cadastre seus carretéis para a calculadora usar o custo real por grama."
          action={<FilamentDialog brands={brands ?? []} />}
        />
      ) : (
        <>
          {lowStock.length > 0 && (
            <div role="alert" className="flex gap-3 rounded-xl border border-warning/40 bg-warning/10 p-4 text-sm">
              <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden />
              <div>
                <p className="font-medium">Estoque baixo</p>
                <p className="text-muted-foreground">
                  {lowStock.map((f) => `${f.material} ${f.color_name} (${formatGrams(f.remaining_g)})`).join(" · ")}
                </p>
              </div>
            </div>
          )}

          {averages.length > 0 && (
            <section aria-labelledby="avg-title" className="grid gap-3">
              <h2 id="avg-title" className="text-sm font-medium text-muted-foreground">
                Custo médio por material (ponderado pelo estoque)
              </h2>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
                {averages.map(([material, avg]) => (
                  <Card key={material} className="gap-1 py-4">
                    <CardContent className="px-4">
                      <p className="text-sm text-muted-foreground">{material}</p>
                      <p className="text-lg font-semibold tabular-nums">{formatUnitCost(avg)}/g</p>
                      <p className="text-xs text-muted-foreground tabular-nums">
                        {formatCurrency(avg * 1000)}/kg
                      </p>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </section>
          )}

          <section aria-label="Carretéis em estoque" className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {active.map((f) => (
              <FilamentCard key={f.id} filament={f} />
            ))}
          </section>

          {finished.length > 0 && (
            <details className="group rounded-xl border p-4">
              <summary className="cursor-pointer text-sm font-medium">
                Carretéis que acabaram ({finished.length})
              </summary>
              <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {finished.map((f) => (
                  <FilamentCard key={f.id} filament={f} />
                ))}
              </div>
            </details>
          )}
        </>
      )}
    </div>
  );
}

type FilamentWithBrand = {
  id: string;
  material: string;
  color_name: string;
  color_hex: string;
  remaining_g: number;
  net_weight_g: number;
  min_stock_g: number;
  cost_per_gram: number | null;
  status: string;
  filament_brands: { name: string } | null;
};

function FilamentCard({ filament: f }: { filament: FilamentWithBrand }) {
  const status = f.status as FilamentStatus;
  const percent = remainingPercent(f.remaining_g, f.net_weight_g);
  const low = isLowStock(f.remaining_g, f.min_stock_g, status);

  return (
    <Link
      href={`/filamentos/${f.id}`}
      className="rounded-xl transition-transform focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none hover:-translate-y-0.5"
    >
      <Card className={cn("h-full gap-4", status === "empty" && "opacity-60")}>
        <CardHeader>
          <CardTitle className="flex items-start justify-between gap-2">
            <span className="flex items-center gap-2">
              <ColorDot hex={f.color_hex} className="size-5" />
              <span>
                {f.material} {f.color_name}
                <span className="block text-sm font-normal text-muted-foreground">
                  {f.filament_brands?.name ?? "Sem marca"}
                </span>
              </span>
            </span>
            <Badge variant={status === "in_use" ? "default" : "outline"}>{FILAMENT_STATUS_LABEL[status]}</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="grid gap-2">
          <div className="flex items-baseline justify-between text-sm tabular-nums">
            <span className={cn("font-semibold", low && "text-warning")}>{formatGrams(f.remaining_g)}</span>
            <span className="text-muted-foreground">de {formatGrams(f.net_weight_g)}</span>
          </div>
          <Progress
            value={percent}
            aria-label={`Restante: ${Math.round(percent)}%`}
            className={cn(low && "[&>[data-slot=progress-indicator]]:bg-warning")}
          />
          <p className="text-sm text-muted-foreground tabular-nums">
            {f.cost_per_gram === null ? "—" : `${formatUnitCost(f.cost_per_gram)}/g`}
          </p>
        </CardContent>
      </Card>
    </Link>
  );
}
