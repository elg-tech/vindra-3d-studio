"use client";

import { ArrowRightLeft, Clock } from "lucide-react";
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
import { BOARD_STATUSES, type BoardStatus, ORDER_STATUS_LABEL, formatMinutes } from "@/lib/orders";
import { cn } from "@/lib/utils";
import { DueBadge, PaymentBadge } from "./order-badges";

/** Card do pedido no quadro. "Mover para…" funciona sem arrastar (celular, teclado, leitor de tela). */
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
  return (
    <article
      aria-label={`Pedido ${order.number}`}
      className={cn(
        "grid gap-2 rounded-lg border bg-card p-3 text-sm shadow-xs transition-shadow",
        dragging && "opacity-60 shadow-lg ring-2 ring-ring",
        className,
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <Link
          href={`/pedidos/${order.id}`}
          className="font-medium tabular-nums hover:underline focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
        >
          {order.number}
        </Link>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button type="button" variant="ghost" size="icon" className="-mt-1 -mr-1 size-7" aria-label={`Mover ${order.number} para…`}>
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
      </div>
      <p className="truncate text-muted-foreground">
        {order.customerName ?? order.channelName ?? "Sem cliente"}
        {order.platformOrderNumber && ` · #${order.platformOrderNumber}`}
      </p>
      <div className="flex flex-wrap items-center gap-1.5">
        <PaymentBadge state={order.paymentState} />
        <DueBadge dueDate={order.dueDate} status={order.status} />
      </div>
      <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
        <span className="tabular-nums">
          {order.itemCount} {order.itemCount === 1 ? "peça" : "peças"}
          {order.printMinutes > 0 && (order.status === "queued" || order.status === "printing") && (
            <>
              {" · "}
              <span className="inline-flex items-center gap-1">
                <Clock className="size-3" aria-hidden />
                {formatMinutes(order.printMinutes)}
              </span>
            </>
          )}
        </span>
        <span className="font-medium text-foreground tabular-nums">{formatCurrency(order.total)}</span>
      </div>
    </article>
  );
}
