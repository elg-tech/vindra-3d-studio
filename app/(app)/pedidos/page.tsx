import { addMinutes } from "date-fns";
import { ClipboardList, Plus, Printer, TriangleAlert } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { formatDateTime, formatNumber } from "@/lib/format";
import { loadBoard } from "@/lib/order-loaders";
import { formatMinutes } from "@/lib/orders";
import { createClient } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";
import { OrderBoard } from "./order-board";

export const metadata: Metadata = { title: "Pedidos" };

const pct = (n: number) => `${formatNumber(Math.round(n * 10) / 10)}%`;

export default async function PedidosPage() {
  const supabase = await createClient();
  const { orders, spools, queueMinutes, failure } = await loadBoard(supabase);

  const newButton = (
    <Button asChild>
      <Link href="/pedidos/novo">
        <Plus aria-hidden /> Novo pedido
      </Link>
    </Button>
  );

  return (
    <div data-page-wide className="grid gap-6">
      <PageHeader title="Pedidos" description="Produção, pagamentos e entregas." actions={newButton} />

      {orders.length === 0 ? (
        <EmptyState
          icon={ClipboardList}
          title="Nenhum pedido em andamento"
          description="Converta um orçamento aprovado ou registre uma venda da Shopee/TikTok."
          action={newButton}
        />
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="flex items-center gap-3 rounded-xl border p-3 text-sm">
              <Printer className="size-5 shrink-0 text-muted-foreground" aria-hidden />
              <p>
                {queueMinutes > 0 ? (
                  <>
                    Impressora livre em <strong className="tabular-nums">~{formatMinutes(queueMinutes)}</strong>
                    <span className="text-muted-foreground"> ({formatDateTime(addMinutes(new Date(), queueMinutes))})</span>
                  </>
                ) : (
                  "Fila de impressão vazia."
                )}
              </p>
            </div>
            {failure.realPct !== null && (
              <div
                className={cn(
                  "flex items-center gap-3 rounded-xl border p-3 text-sm",
                  failure.realPct > failure.configuredPct && "border-warning/40 bg-warning/10",
                )}
              >
                <TriangleAlert
                  className={cn("size-5 shrink-0", failure.realPct > failure.configuredPct ? "text-warning" : "text-muted-foreground")}
                  aria-hidden
                />
                <p>
                  Falha real (90 dias): <strong className="tabular-nums">{pct(failure.realPct)}</strong>
                  <span className="text-muted-foreground"> · nas Configurações: {pct(failure.configuredPct)}</span>
                </p>
              </div>
            )}
          </div>
          <OrderBoard orders={orders} spools={spools} />
        </>
      )}
    </div>
  );
}
