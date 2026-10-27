"use client";

import { ArrowRight, ArrowRightLeft, Clock } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { formatCurrency } from "@/lib/format";
import type { BoardOrder } from "@/lib/order-loaders";
import { BOARD_STATUSES, type BoardStatus, ORDER_STATUS_LABEL, formatMinutes, nextStatus } from "@/lib/orders";
import { cn } from "@/lib/utils";
import { DueBadge, PaymentBadge } from "./order-badges";

/**
 * Card do pedido no quadro, compacto para caber 7 colunas na tela.
 * "Avançar →" leva à próxima etapa com um clique; "Mover para…" leva a qualquer coluna
 * (também é o caminho sem arrastar: celular, teclado e leitor de tela).
 */
export function OrderCard({
  order,
  onMove,
  dragging,
  className,
}: {
  order: BoardOrder;
  onMove: (target: BoardStatus) => void;
  dragging?: boolean;
  className?: string;
}) {
  const next = nextStatus(order.status);
  return (
    <article
      aria-label={`Pedido ${order.number}`}
      className={cn(
        // coluna única que pode encolher: o conteúdo não alarga o card além da coluna
        "grid min-w-0 grid-cols-[minmax(0,1fr)] gap-1.5 rounded-lg border bg-card p-2.5 text-sm xl:p-2 shadow-xs transition-shadow",
        dragging && "opacity-60 shadow-lg ring-2 ring-ring",
        className,
      )}
    >
      <Link
        href={`/pedidos/${order.id}`}
        className="truncate font-medium tabular-nums hover:underline focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
      >
        {order.number}
      </Link>
      <p className="truncate text-xs text-muted-foreground">
        {order.customerName ?? order.channelName ?? "Sem cliente"}
        {order.platformOrderNumber && ` · #${order.platformOrderNumber}`}
      </p>
      <div className="flex flex-wrap items-center gap-1">
        <PaymentBadge state={order.paymentState} className="block max-w-full truncate" />
        <DueBadge dueDate={order.dueDate} status={order.status} />
      </div>
      <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1">
        <span className="text-xs font-medium tabular-nums">
          {formatCurrency(order.total)}
          {order.printMinutes > 0 && (order.status === "queued" || order.status === "printing") && (
            <>
              {" · "}
              <span className="inline-flex items-center gap-0.5 font-normal text-muted-foreground">
                <Clock className="size-3" aria-hidden />
                {formatMinutes(order.printMinutes)}
              </span>
            </>
          )}
        </span>
        <span className="ml-auto flex flex-wrap items-center justify-end gap-1">
          {next && (
            <Button
              type="button"
              variant="outline"
              size="xs"
              className="px-1.5"
              onClick={() => onMove(next)}
              aria-label={`Avançar ${order.number} para ${ORDER_STATUS_LABEL[next]}`}
              title={`Avançar para ${ORDER_STATUS_LABEL[next]}`}
            >
              Avançar <ArrowRight aria-hidden />
            </Button>
          )}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button type="button" variant="ghost" size="icon-xs" className="shrink-0" aria-label={`Mover ${order.number} para…`}>
                <ArrowRightLeft aria-hidden />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuLabel>Mover para…</DropdownMenuLabel>
              {BOARD_STATUSES.filter((s) => s !== order.status).map((s) => (
                <DropdownMenuItem key={s} onSelect={() => onMove(s)}>
                  {ORDER_STATUS_LABEL[s]}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </span>
      </div>
    </article>
  );
}
