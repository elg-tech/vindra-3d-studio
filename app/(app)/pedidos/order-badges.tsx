import { Badge } from "@/components/ui/badge";
import { formatDay } from "@/lib/quotes";
import { type OrderStatus, PAYMENT_STATE_LABEL, type PaymentState, dueState } from "@/lib/orders";
import { cn } from "@/lib/utils";

const PAYMENT_TONE: Record<PaymentState, string> = {
  platform: "text-muted-foreground",
  awaiting_deposit: "border-warning/50 text-warning",
  awaiting_payment: "border-warning/50 text-warning",
  deposit_paid: "border-primary/40 text-primary",
  paid: "border-success/40 bg-success/10 text-success",
};

export function PaymentBadge({ state, className }: { state: PaymentState; className?: string }) {
  return (
    // title: em coluna estreita o selo é cortado com "…"; o texto completo aparece ao passar o mouse
    <Badge variant="outline" title={PAYMENT_STATE_LABEL[state]} className={cn(PAYMENT_TONE[state], className)}>
      {PAYMENT_STATE_LABEL[state]}
    </Badge>
  );
}

/** "Atrasado · 26/10", "Vence hoje", "até 30/10". */
export function DueBadge({ dueDate, status }: { dueDate: string | null; status: OrderStatus }) {
  const state = dueState(dueDate, status);
  if (!dueDate || !state) return null;
  const day = formatDay(dueDate).slice(0, 5);
  if (state === "overdue")
    return (
      <Badge variant="outline" className="border-destructive/40 bg-destructive/10 text-destructive">
        Atrasado · {day}
      </Badge>
    );
  if (state === "today")
    return (
      <Badge variant="outline" className="border-warning/50 text-warning">
        Vence hoje
      </Badge>
    );
  return <span className="text-xs text-muted-foreground tabular-nums">até {day}</span>;
}
