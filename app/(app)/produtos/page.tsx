import { AlertTriangle, ImageOff, Package, Plus, Search } from "lucide-react";
import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { formatNumber } from "@/lib/format";
import { loadProductSummaries } from "@/lib/product-loaders";
import { productImageUrl } from "@/lib/products";
import { createClient } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";
import { StatusBadge } from "./status-badge";

export const metadata: Metadata = { title: "Produtos" };

const FILTERS = {
  todos: "Ativos",
  margem: "Margem ruim",
  taxas: "Taxas não configuradas",
  "sem-custo": "Sem custo",
  inativos: "Inativos",
} as const;
type Filter = keyof typeof FILTERS;

export default async function ProdutosPage({
  searchParams,
}: {
  searchParams: Promise<{ filtro?: string; q?: string }>;
}) {
  const params = await searchParams;
  const filter: Filter = params.filtro && params.filtro in FILTERS ? (params.filtro as Filter) : "todos";
  const q = (params.q ?? "").trim().toLowerCase();

  const rows = await loadProductSummaries(await createClient());

  const activeRows = rows.filter((r) => r.active);
  const counts: Record<Filter, number> = {
    todos: activeRows.length,
    margem: activeRows.filter((r) => r.summary.badMargin).length,
    taxas: activeRows.filter((r) => r.summary.feesNotConfigured).length,
    "sem-custo": activeRows.filter((r) => r.summary.missingCost).length,
    inativos: rows.length - activeRows.length,
  };

  const visible = (filter === "inativos" ? rows.filter((r) => !r.active) : activeRows)
    .filter((r) => {
      if (filter === "margem") return r.summary.badMargin;
      if (filter === "taxas") return r.summary.feesNotConfigured;
      if (filter === "sem-custo") return r.summary.missingCost;
      return true;
    })
    .filter(
      (r) =>
        !q ||
        r.name.toLowerCase().includes(q) ||
        [r.sku, ...r.product_variants.map((v) => v.sku)].some((sku) => sku?.toLowerCase().includes(q)),
    );

  const alerts = [
    counts.margem > 0 && { filter: "margem", text: `${counts.margem} com margem abaixo do mínimo ou prejuízo` },
    counts.taxas > 0 && { filter: "taxas", text: `${counts.taxas} com preço em canal sem taxas configuradas` },
    counts["sem-custo"] > 0 && { filter: "sem-custo", text: `${counts["sem-custo"]} sem ficha ou sem custo de filamento` },
  ].filter((a): a is { filter: Filter; text: string } => Boolean(a));

  const newButton = (
    <Button asChild>
      <Link href="/produtos/novo">
        <Plus aria-hidden /> Novo produto
      </Link>
    </Button>
  );

  return (
    <div className="grid gap-6">
      <PageHeader title="Produtos" description="Catálogo, variações e lucro por canal." actions={newButton} />

      {rows.length === 0 ? (
        <EmptyState
          icon={Package}
          title="Nenhum produto ainda"
          description="Cadastre aqui ou, na calculadora, salve uma ficha e use “Salvar como produto”."
          action={newButton}
        />
      ) : (
        <>
          {alerts.length > 0 && (
            <div role="alert" className="flex gap-3 rounded-xl border border-warning/40 bg-warning/10 p-4 text-sm">
              <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden />
              <div className="grid gap-1">
                <p className="font-medium">Produtos que precisam de atenção (recalculado com custos e taxas atuais)</p>
                <ul className="grid gap-0.5">
                  {alerts.map((a) => (
                    <li key={a.filter}>
                      <Link href={`/produtos?filtro=${a.filter}`} className="underline underline-offset-4">
                        {a.text}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          )}

          <div className="grid gap-3">
            <nav aria-label="Filtros" className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 md:mx-0 md:flex-wrap md:px-0">
              {(Object.keys(FILTERS) as Filter[]).map((f) => (
                <Link
                  key={f}
                  href={f === "todos" ? "/produtos" : `/produtos?filtro=${f}`}
                  aria-current={f === filter ? "page" : undefined}
                  className={cn(
                    "shrink-0 rounded-full border px-3 py-1 text-sm whitespace-nowrap transition-colors",
                    f === filter ? "border-primary bg-primary text-primary-foreground" : "hover:bg-muted",
                  )}
                >
                  {FILTERS[f]} <span className="tabular-nums opacity-70">{counts[f]}</span>
                </Link>
              ))}
            </nav>
            <form role="search" className="relative max-w-sm">
              {filter !== "todos" && <input type="hidden" name="filtro" value={filter} />}
              <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
              <Input
                type="search"
                name="q"
                defaultValue={params.q ?? ""}
                placeholder="Buscar por nome ou SKU"
                aria-label="Buscar produtos por nome ou SKU"
                className="pl-8"
              />
            </form>
          </div>

          {visible.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhum produto neste filtro.</p>
          ) : (
            <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {visible.map((p) => {
                const image = productImageUrl(p.image_path);
                return (
                  <li key={p.id}>
                    <Card className="h-full gap-0 overflow-hidden py-0 transition-colors hover:border-ring/60">
                      <Link
                        href={`/produtos/${p.id}`}
                        className="flex h-full gap-3 p-3 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                      >
                        <div className="relative size-20 shrink-0 overflow-hidden rounded-lg bg-muted">
                          {image ? (
                            <Image src={image} alt="" fill sizes="80px" className="object-cover" />
                          ) : (
                            <ImageOff className="absolute inset-0 m-auto size-6 text-muted-foreground" aria-hidden />
                          )}
                        </div>
                        <div className="grid min-w-0 flex-1 content-start gap-1">
                          <p className="truncate font-medium">{p.name}</p>
                          <p className="truncate text-xs text-muted-foreground">
                            {[p.sku, `${p.product_variants.length} variação(ões)`].filter(Boolean).join(" · ")}
                          </p>
                          <div className="flex flex-wrap items-center gap-2 pt-1">
                            <StatusBadge status={p.summary.worst} />
                            {p.summary.lowestMarginPct !== null && (
                              <span className="text-xs text-muted-foreground tabular-nums">
                                menor margem {formatNumber(Math.round(p.summary.lowestMarginPct * 10) / 10)}%
                              </span>
                            )}
                          </div>
                        </div>
                      </Link>
                    </Card>
                  </li>
                );
              })}
            </ul>
          )}
        </>
      )}
    </div>
  );
}
