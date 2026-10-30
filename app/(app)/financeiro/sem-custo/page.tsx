import { ArrowLeft, CheckCircle2, ChevronRight, TriangleAlert } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { isMonth, missingCostOrders, monthTitle } from "@/lib/finance";
import { loadFinance } from "@/lib/finance-loaders";
import { ORDER_STATUS_LABEL } from "@/lib/orders";
import { createClient } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Pedidos com item sem custo" };

/** Lista do aviso amarelo do DRE: cada item sem custo leva direto a ele na página do pedido. */
export default async function SemCustoPage({ searchParams }: { searchParams: Promise<{ mes?: string }> }) {
  const { mes } = await searchParams;
  const month = isMonth(mes) ? mes : null;
  const data = await loadFinance(await createClient());
  const orders = missingCostOrders(data.orders, month);
  const itemCount = orders.reduce((s, o) => s + o.items.length, 0);

  return (
    <div className="grid gap-6">
      <div className="grid gap-3">
        <Button asChild variant="ghost" size="sm" className="w-fit">
          <Link href={month ? `/financeiro?mes=${month}` : "/financeiro"}>
            <ArrowLeft aria-hidden /> Financeiro
          </Link>
        </Button>
        <PageHeader
          title="Pedidos com item sem custo"
          description={`${month ? `DRE de ${monthTitle(month)}` : "Todos os pedidos"}. Item sem custo conta como R$ 0 e infla o lucro. Abra o item e use “Definir custo”; o preço não muda.`}
        />
      </div>

      <nav aria-label="Período" className="flex flex-wrap gap-2">
        {mes && isMonth(mes) && (
          <FilterLink href={`/financeiro/sem-custo?mes=${mes}`} active={month !== null}>
            {monthTitle(mes)}
          </FilterLink>
        )}
        <FilterLink href="/financeiro/sem-custo" active={month === null}>
          Todos os pedidos
        </FilterLink>
      </nav>

      {orders.length === 0 ? (
        <EmptyState
          icon={CheckCircle2}
          title="Nenhum item sem custo"
          description={month ? "Todos os pedidos deste DRE têm custo." : "Todos os pedidos têm custo."}
        />
      ) : (
        <Card>
          <CardContent className="grid gap-1 pt-6">
            <p className="flex items-center gap-2 pb-2 text-sm">
              <TriangleAlert className="size-4 shrink-0 text-warning" aria-hidden />
              {orders.length} {orders.length === 1 ? "pedido" : "pedidos"} · {itemCount} {itemCount === 1 ? "item" : "itens"} sem custo
            </p>
            <ul className="divide-y">
              {orders.map((o) => (
                <li key={o.id} className="grid gap-1 py-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <Link href={`/pedidos/${o.id}`} className="font-medium tabular-nums hover:underline">
                      {o.number}
                    </Link>
                    <Badge variant="outline">{ORDER_STATUS_LABEL[o.status]}</Badge>
                    {o.recognizedOn === null && <span className="text-xs text-muted-foreground">ainda não pago por inteiro</span>}
                  </div>
                  <ul className="grid">
                    {o.items.map((i) => (
                      <li key={i.id}>
                        <Link
                          href={`/pedidos/${o.id}#item-${i.id}`}
                          className="flex min-h-11 items-center justify-between gap-3 rounded-md px-2 text-sm hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                        >
                          <span className="min-w-0 break-words">{i.description}</span>
                          <span className="flex shrink-0 items-center gap-1 text-xs text-muted-foreground">
                            Definir custo <ChevronRight className="size-4" aria-hidden />
                          </span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function FilterLink({ href, active, children }: { href: string; active: boolean; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={cn(
        "inline-flex min-h-9 items-center rounded-full border px-3 text-sm",
        active ? "border-primary bg-primary text-primary-foreground" : "hover:bg-accent",
      )}
    >
      {children}
    </Link>
  );
}
