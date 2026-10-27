"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import type { ExpectedLine, SpoolOption } from "@/lib/order-loaders";
import { type BoardStatus, CONSUMES_FILAMENT, ORDER_STATUS_LABEL, type PaymentState, moveWarning } from "@/lib/orders";
import { moveOrder } from "./actions";
import { ConsumeDialog } from "./consume-dialog";

export type MovableOrder = {
  id: string;
  number: string;
  consumed: boolean;
  paymentState: PaymentState;
  expected: ExpectedLine[];
};

type Pending = { order: MovableOrder; target: BoardStatus; columnOrder: string[] };

/**
 * Mover um pedido de coluna. Entrar em produção sem baixa abre a confirmação de baixa antes;
 * pagamento pendente gera aviso, sem bloquear.
 */
export function useOrderMove(spools: SpoolOption[], onMoved?: (orderId: string, target: BoardStatus) => void) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [pending, setPending] = useState<Pending | null>(null);

  function commit({ order, target, columnOrder }: Pending) {
    startTransition(async () => {
      const result = await moveOrder(order.id, target, columnOrder);
      if (!result.ok) {
        toast.error(result.error);
        router.refresh();
        return;
      }
      const warning = moveWarning(target, order.paymentState);
      if (warning) toast.warning(`${order.number} em “${ORDER_STATUS_LABEL[target]}”. ${warning}`);
      onMoved?.(order.id, target);
      router.refresh();
    });
  }

  function request(order: MovableOrder, target: BoardStatus, columnOrder: string[] = [order.id]) {
    if (CONSUMES_FILAMENT.has(target) && !order.consumed) {
      setPending({ order, target, columnOrder });
      return;
    }
    commit({ order, target, columnOrder });
  }

  const dialog = pending && (
    <ConsumeDialog
      key={pending.order.id}
      open
      onOpenChange={(open) => {
        if (!open) {
          setPending(null);
          router.refresh(); // desfaz o arraste otimista se a baixa foi cancelada
        }
      }}
      orderId={pending.order.id}
      orderNumber={pending.order.number}
      expected={pending.order.expected}
      spools={spools}
      onDone={() => {
        const p = pending;
        setPending(null);
        commit({ ...p, order: { ...p.order, consumed: true } });
      }}
    />
  );

  return { request, dialog, isPending };
}
