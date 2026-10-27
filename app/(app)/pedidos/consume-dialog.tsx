"use client";

import { Loader2, Plus, Trash2 } from "lucide-react";
import { useId, useState, useTransition } from "react";
import { toast } from "sonner";
import { ColorDot } from "@/components/color-dot";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { formatGrams } from "@/lib/format";
import { parseDecimal } from "@/lib/numbers";
import type { ExpectedLine, SpoolOption } from "@/lib/order-loaders";
import { consumeFilament } from "./actions";

type Line = { key: number; filamentId: string; grams: string; hint: string | null };

const gramsText = (n: number) => String(n).replace(".", ",");

/**
 * Baixa do filamento ao entrar em produção: um carretel e os gramas reais por linha,
 * pré-preenchidos com o previsto pelas fichas. "Mover sem baixar" marca o pedido sem baixa.
 */
export function ConsumeDialog({
  open,
  onOpenChange,
  orderId,
  orderNumber,
  expected,
  spools,
  onDone,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  orderId: string;
  orderNumber: string;
  expected: ExpectedLine[];
  spools: SpoolOption[];
  onDone: () => void;
}) {
  const id = useId();
  const [isPending, startTransition] = useTransition();
  const [lines, setLines] = useState<Line[]>(() =>
    expected.map((l, i) => ({
      key: i,
      filamentId: l.suggestedSpoolId ?? "",
      grams: gramsText(l.grams),
      hint: `${l.material}${l.filamentId ? "" : " (média)"} · previsto ${formatGrams(l.grams)}`,
    })),
  );
  const available = spools.filter((s) => s.inStock);

  const update = (key: number, patch: Partial<Line>) => setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l)));

  function submit(skip: boolean) {
    if (!skip) {
      const incomplete = lines.find((l) => !l.filamentId || (parseDecimal(l.grams) ?? -1) < 0);
      if (incomplete) {
        toast.error("Escolha o carretel e os gramas de cada linha (ou remova a linha).");
        return;
      }
      if (lines.length === 0) {
        toast.error("Adicione uma linha ou use “Mover sem baixar”.");
        return;
      }
    }
    startTransition(async () => {
      const result = await consumeFilament({
        orderId,
        skip,
        lines: skip ? [] : lines.map((l) => ({ filamentId: l.filamentId, grams: l.grams })),
      });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success(result.message);
      onOpenChange(false);
      onDone();
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Baixar filamento do {orderNumber}</DialogTitle>
          <DialogDescription>
            Confira o carretel usado e corrija os gramas se precisar. Os gramas saem do estoque agora.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-3">
          {lines.length === 0 && (
            <p className="text-sm text-muted-foreground">Sem previsão (itens sem ficha). Adicione as linhas à mão.</p>
          )}
          {lines.map((l, i) => {
            const spool = spools.find((s) => s.id === l.filamentId);
            const grams = parseDecimal(l.grams) ?? 0;
            return (
              <div key={l.key} className="grid gap-2 rounded-lg border p-3">
                {l.hint && <p className="text-xs text-muted-foreground">{l.hint}</p>}
                <div className="grid grid-cols-[minmax(0,1fr)_6.5rem_auto] items-end gap-2">
                  <div className="grid min-w-0 gap-1.5">
                    <Label htmlFor={`${id}-spool-${l.key}`}>Carretel {i + 1}</Label>
                    <Select value={l.filamentId || undefined} onValueChange={(v) => update(l.key, { filamentId: v })}>
                      <SelectTrigger
                        id={`${id}-spool-${l.key}`}
                        className="w-full min-w-0 *:data-[slot=select-value]:block *:data-[slot=select-value]:truncate"
                      >
                        <SelectValue placeholder="Escolha o carretel" />
                      </SelectTrigger>
                      <SelectContent>
                        {available.map((s) => (
                          <SelectItem key={s.id} value={s.id}>
                            <ColorDot hex={s.colorHex} className="mr-1.5 align-[-3px]" />
                            {s.label}
                            <span className="text-muted-foreground tabular-nums"> · {formatGrams(s.remainingG)}</span>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="relative">
                    <Input
                      aria-label={`Gramas do carretel ${i + 1}`}
                      inputMode="decimal"
                      autoComplete="off"
                      className="pr-7 tabular-nums"
                      value={l.grams}
                      onChange={(e) => update(l.key, { grams: e.target.value })}
                    />
                    <span className="pointer-events-none absolute inset-y-0 right-2.5 flex items-center text-sm text-muted-foreground">g</span>
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() => setLines((ls) => ls.filter((x) => x.key !== l.key))}
                    aria-label={`Remover linha ${i + 1}`}
                  >
                    <Trash2 aria-hidden />
                  </Button>
                </div>
                {spool && grams > spool.remainingG && (
                  <p className="text-xs text-warning">
                    O carretel tem {formatGrams(spool.remainingG)} registrados: o saldo vai a zero e ele fica como &ldquo;Acabou&rdquo;.
                  </p>
                )}
              </div>
            );
          })}
          <Button
            type="button"
            variant="outline"
            className="w-fit"
            onClick={() => setLines((ls) => [...ls, { key: Date.now(), filamentId: "", grams: "", hint: null }])}
          >
            <Plus aria-hidden /> Adicionar carretel
          </Button>
        </div>

        <DialogFooter className="gap-2 sm:justify-between">
          <Button type="button" variant="ghost" disabled={isPending} onClick={() => submit(true)}>
            Mover sem baixar
          </Button>
          <Button type="button" disabled={isPending} onClick={() => submit(false)}>
            {isPending && <Loader2 className="animate-spin" aria-hidden />}
            Baixar e mover
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
