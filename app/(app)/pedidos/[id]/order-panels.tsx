"use client";

import { Ban, CheckCircle2, Loader2, Trash2, TriangleAlert, Undo2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useId, useState, useTransition } from "react";
import { toast } from "sonner";
import { ColorDot } from "@/components/color-dot";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import type { ActionResult } from "@/lib/actions";
import { formatCurrency, formatGrams } from "@/lib/format";
import type { SpoolOption } from "@/lib/order-loaders";
import {
  BOARD_STATUSES,
  type BoardStatus,
  ORDER_STATUS_LABEL,
  type OrderStatus,
  PAYMENT_KIND_LABEL,
  PAYMENT_METHOD_LABEL,
  type PaymentKind,
  type PaymentMethod,
} from "@/lib/orders";
import { formatDay, todayIso } from "@/lib/quotes";
import { cancelOrder, deleteOrder, markPayment, recordFailure, unmarkPayment, updateOrderDetails } from "../actions";
import { type MovableOrder, useOrderMove } from "../use-order-move";

function useRun() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const run = (action: () => Promise<ActionResult<unknown>>, after?: () => void) =>
    startTransition(async () => {
      const result = await action();
      if (!result.ok) {
        toast.error(Object.values(result.fieldErrors ?? {})[0] ?? result.error);
        return;
      }
      if (result.message) toast.success(result.message);
      after?.();
      router.refresh();
    });
  return { run, isPending };
}

// ---------------------------------------------------------------
// Status
// ---------------------------------------------------------------
export function StatusPanel({ order, status, spools }: { order: MovableOrder; status: OrderStatus; spools: SpoolOption[] }) {
  const id = useId();
  const { request, dialog, isPending } = useOrderMove(spools);
  if (status === "cancelled") return null;
  return (
    <div className="grid gap-1.5">
      {dialog}
      <Label htmlFor={id}>Status</Label>
      <Select value={status} onValueChange={(v) => request(order, v as BoardStatus)} disabled={isPending}>
        <SelectTrigger id={id} className="w-full">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {BOARD_STATUSES.map((s) => (
            <SelectItem key={s} value={s}>
              {ORDER_STATUS_LABEL[s]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

// ---------------------------------------------------------------
// Pagamentos
// ---------------------------------------------------------------
export type PaymentRow = { kind: PaymentKind; amount: number; paidOn: string | null; method: PaymentMethod | null };

export function PaymentsPanel({ orderId, payments, paidByPlatform, channelName, cancelled }: {
  orderId: string;
  payments: PaymentRow[];
  paidByPlatform: boolean;
  channelName: string | null;
  cancelled: boolean;
}) {
  const { run, isPending } = useRun();
  return (
    <Card>
      <CardHeader>
        <CardTitle>Pagamento</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-3 text-sm">
        {paidByPlatform ? (
          <p className="text-muted-foreground">Pago na plataforma{channelName ? ` (${channelName})` : ""}: o repasse entra pelo canal.</p>
        ) : (
          payments.map((p) => (
            <div key={p.kind} className="grid gap-2 rounded-lg border p-3">
              <div className="flex items-center justify-between gap-2">
                <span className="font-medium">{PAYMENT_KIND_LABEL[p.kind]}</span>
                <span className="tabular-nums">{formatCurrency(p.amount)}</span>
              </div>
              {p.paidOn ? (
                <div className="flex items-center justify-between gap-2 text-muted-foreground">
                  <span className="flex items-center gap-1.5">
                    <CheckCircle2 className="size-4 text-success" aria-hidden />
                    Pago em {formatDay(p.paidOn)} · {p.method ? PAYMENT_METHOD_LABEL[p.method] : ""}
                  </span>
                  {!cancelled && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      disabled={isPending}
                      onClick={() => run(() => unmarkPayment(orderId, p.kind))}
                    >
                      <Undo2 aria-hidden /> Desfazer
                    </Button>
                  )}
                </div>
              ) : (
                !cancelled && <MarkPaymentDialog orderId={orderId} kind={p.kind} amount={p.amount} />
              )}
            </div>
          ))
        )}
      </CardContent>
    </Card>
  );
}

function MarkPaymentDialog({ orderId, kind, amount }: { orderId: string; kind: PaymentKind; amount: number }) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const [paidOn, setPaidOn] = useState(todayIso());
  const [method, setMethod] = useState<PaymentMethod>("pix");
  const { run, isPending } = useRun();
  const label = kind === "deposit" ? "Marcar sinal pago" : kind === "balance" ? "Marcar restante pago" : "Marcar pago";
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button type="button" size="sm" className="w-full">
          {label}
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>{label}</DialogTitle>
          <DialogDescription>
            {PAYMENT_KIND_LABEL[kind]} de {formatCurrency(amount)}. Entra como receita no Financeiro, na data do pagamento.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4">
          <div className="grid gap-1.5">
            <Label htmlFor={`${id}-date`}>Data</Label>
            <Input id={`${id}-date`} type="date" value={paidOn} max={todayIso()} onChange={(e) => setPaidOn(e.target.value)} />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor={`${id}-method`}>Forma</Label>
            <Select value={method} onValueChange={(v) => setMethod(v as PaymentMethod)}>
              <SelectTrigger id={`${id}-method`} className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(Object.keys(PAYMENT_METHOD_LABEL) as PaymentMethod[]).map((m) => (
                  <SelectItem key={m} value={m}>
                    {PAYMENT_METHOD_LABEL[m]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button
            type="button"
            disabled={isPending}
            onClick={() => run(() => markPayment({ orderId, kind, paidOn, method }), () => setOpen(false))}
          >
            {isPending && <Loader2 className="animate-spin" aria-hidden />}
            Confirmar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------
// Falha de impressão
// ---------------------------------------------------------------
export function FailureDialog({ orderId, spools }: { orderId: string; spools: SpoolOption[] }) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const [filamentId, setFilamentId] = useState("");
  const [grams, setGrams] = useState("");
  const [minutes, setMinutes] = useState("");
  const [reason, setReason] = useState("");
  const { run, isPending } = useRun();
  const options = spools.filter((s) => s.inStock || s.id === filamentId);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button type="button" variant="outline" className="w-full">
          <TriangleAlert aria-hidden /> Registrar falha
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Falha de impressão</DialogTitle>
          <DialogDescription>Os gramas perdidos saem do carretel e o custo entra no lucro deste pedido.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4">
          <div className="grid gap-1.5">
            <Label htmlFor={`${id}-spool`}>Carretel</Label>
            <Select value={filamentId || undefined} onValueChange={setFilamentId}>
              <SelectTrigger id={`${id}-spool`} className="w-full min-w-0 *:data-[slot=select-value]:block *:data-[slot=select-value]:truncate">
                <SelectValue placeholder="Escolha o carretel" />
              </SelectTrigger>
              <SelectContent>
                {options.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    <ColorDot hex={s.colorHex} className="mr-1.5 align-[-3px]" />
                    {s.label}
                    <span className="text-muted-foreground tabular-nums"> · {formatGrams(s.remainingG)}</span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1.5">
              <Label htmlFor={`${id}-grams`}>Gramas perdidos</Label>
              <Input id={`${id}-grams`} inputMode="decimal" autoComplete="off" value={grams} onChange={(e) => setGrams(e.target.value)} />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor={`${id}-minutes`}>Minutos perdidos</Label>
              <Input id={`${id}-minutes`} inputMode="numeric" autoComplete="off" value={minutes} onChange={(e) => setMinutes(e.target.value)} />
            </div>
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor={`${id}-reason`}>Motivo</Label>
            <Input id={`${id}-reason`} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="ex.: descolou da mesa" />
          </div>
        </div>
        <DialogFooter>
          <Button
            type="button"
            disabled={isPending}
            onClick={() =>
              run(
                () => recordFailure({ orderId, filamentId, grams: grams || "0", minutes: minutes || "0", reason }),
                () => {
                  setOpen(false);
                  setGrams("");
                  setMinutes("");
                  setReason("");
                },
              )
            }
          >
            {isPending && <Loader2 className="animate-spin" aria-hidden />}
            Registrar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------
// Cancelar
// ---------------------------------------------------------------
type Choice<T extends string> = { value: T; label: string; hint: string };

/** Pergunta de escolha única (radio), com a explicação de cada opção. */
function ChoiceGroup<T extends string>({
  legend,
  options,
  value,
  onChange,
}: {
  legend: string;
  options: Choice<T>[];
  value: T | null;
  onChange: (v: T) => void;
}) {
  const name = useId();
  return (
    <fieldset className="grid gap-2">
      <legend className="mb-2 text-sm font-medium">{legend}</legend>
      {options.map((o) => (
        <label
          key={o.value}
          className="flex items-start gap-3 rounded-lg border p-3 text-sm transition-colors has-checked:border-primary has-checked:bg-primary/5"
        >
          <input
            type="radio"
            name={name}
            value={o.value}
            checked={value === o.value}
            onChange={() => onChange(o.value)}
            className="mt-0.5 size-4 accent-primary"
          />
          <span className="grid gap-0.5">
            <span className="font-medium">{o.label}</span>
            <span className="text-xs text-muted-foreground">{o.hint}</span>
          </span>
        </label>
      ))}
    </fieldset>
  );
}

export function CancelOrder({
  orderId,
  number,
  consumed,
  refund,
}: {
  orderId: string;
  number: string;
  consumed: boolean;
  /** O que o cliente já pagou (0 = nenhum pagamento). */
  refund: number;
}) {
  const [open, setOpen] = useState(false);
  const [printed, setPrinted] = useState<"yes" | "no" | null>(null);
  const [giveBack, setGiveBack] = useState<"yes" | "no" | null>(null);
  const { run, isPending } = useRun();
  const ready = (!consumed || printed !== null) && (refund <= 0 || giveBack !== null);

  const reset = (next: boolean) => {
    setOpen(next);
    if (!next) {
      setPrinted(null);
      setGiveBack(null);
    }
  };

  return (
    <AlertDialog open={open} onOpenChange={reset}>
      <AlertDialogTrigger asChild>
        <Button type="button" variant="ghost" className="w-full text-destructive hover:text-destructive">
          <Ban aria-hidden /> Cancelar pedido
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent className="max-h-[90dvh] overflow-y-auto">
        <AlertDialogHeader>
          <AlertDialogTitle>Cancelar {number}</AlertDialogTitle>
          <AlertDialogDescription>
            O pedido sai do quadro. Falhas registradas continuam como perda.
            {!consumed && " Nenhum filamento foi baixado."}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <div className="grid gap-5">
          {consumed && (
            <ChoiceGroup
              legend="As peças chegaram a ser impressas?"
              value={printed}
              onChange={setPrinted}
              options={[
                { value: "no", label: "Não", hint: "O filamento baixado volta ao carretel." },
                { value: "yes", label: "Sim", hint: "A baixa fica: as peças são perda." },
              ]}
            />
          )}
          {refund > 0 && (
            <ChoiceGroup
              legend={`Houve pagamento de ${formatCurrency(refund)}: devolver ao cliente?`}
              value={giveBack}
              onChange={setGiveBack}
              options={[
                { value: "yes", label: "Sim, devolver", hint: `Lança um Estorno de ${formatCurrency(refund)} com a data de hoje no Financeiro.` },
                { value: "no", label: "Não", hint: "O valor continua como receita." },
              ]}
            />
          )}
        </div>
        <AlertDialogFooter className="gap-2">
          <AlertDialogCancel>Voltar</AlertDialogCancel>
          <Button
            type="button"
            variant="destructive"
            disabled={!ready || isPending}
            onClick={() => run(() => cancelOrder(orderId, printed === "yes", giveBack === "yes"), () => reset(false))}
          >
            {isPending && <Loader2 className="animate-spin" aria-hidden />}
            Cancelar pedido
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

// ---------------------------------------------------------------
// Excluir
// ---------------------------------------------------------------
export function DeleteOrder({ orderId, number, fromQuote }: { orderId: string; number: string; fromQuote: string | null }) {
  const id = useId();
  const router = useRouter();
  const [typed, setTyped] = useState("");
  const [isPending, startTransition] = useTransition();
  const matches = typed.trim().toUpperCase() === number.toUpperCase();

  const confirm = () =>
    startTransition(async () => {
      const result = await deleteOrder(orderId, typed);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success(result.message ?? "Pedido excluído.");
      router.push("/pedidos");
    });

  return (
    <AlertDialog onOpenChange={(open) => !open && setTyped("")}>
      <AlertDialogTrigger asChild>
        <Button type="button" variant="ghost" className="w-full text-destructive hover:text-destructive">
          <Trash2 aria-hidden /> Excluir pedido
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Excluir {number}</AlertDialogTitle>
          <AlertDialogDescription>
            Apaga o pedido, os itens, os pagamentos, as falhas e os estornos, como se nunca tivesse existido. O filamento
            baixado e o perdido em falhas voltam ao carretel.
            {fromQuote && ` O orçamento ${fromQuote} fica livre para virar pedido de novo.`} Não dá para desfazer. Para um
            pedido real que não vai acontecer, use &quot;Cancelar pedido&quot;.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <div className="grid gap-1.5">
          <Label htmlFor={id}>
            Digite <span className="font-mono">{number}</span> para confirmar
          </Label>
          <Input id={id} value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off" spellCheck={false} />
        </div>
        <AlertDialogFooter className="gap-2">
          <AlertDialogCancel>Voltar</AlertDialogCancel>
          <Button type="button" variant="destructive" disabled={!matches || isPending} onClick={confirm}>
            {isPending && <Loader2 className="animate-spin" aria-hidden />}
            Excluir pedido
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

// ---------------------------------------------------------------
// Prazo, rastreio e observações
// ---------------------------------------------------------------
export function DetailsForm({ orderId, trackingCode, dueDate, notes, disabled }: {
  orderId: string;
  trackingCode: string | null;
  dueDate: string | null;
  notes: string | null;
  disabled: boolean;
}) {
  const id = useId();
  const [values, setValues] = useState({ trackingCode: trackingCode ?? "", dueDate: dueDate ?? "", notes: notes ?? "" });
  const { run, isPending } = useRun();
  return (
    <form
      className="grid gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        run(() => updateOrderDetails({ orderId, ...values }));
      }}
    >
      <fieldset disabled={disabled} className="grid gap-3">
        <div className="grid gap-1.5">
          <Label htmlFor={`${id}-due`}>Prazo</Label>
          <Input id={`${id}-due`} type="date" value={values.dueDate} onChange={(e) => setValues({ ...values, dueDate: e.target.value })} />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor={`${id}-tracking`}>Código de rastreio</Label>
          <Input
            id={`${id}-tracking`}
            value={values.trackingCode}
            autoCapitalize="characters"
            onChange={(e) => setValues({ ...values, trackingCode: e.target.value })}
          />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor={`${id}-notes`}>Observações</Label>
          <Textarea id={`${id}-notes`} rows={3} value={values.notes} onChange={(e) => setValues({ ...values, notes: e.target.value })} />
        </div>
        <Button type="submit" variant="outline" disabled={isPending}>
          {isPending && <Loader2 className="animate-spin" aria-hidden />}
          Salvar
        </Button>
      </fieldset>
    </form>
  );
}
