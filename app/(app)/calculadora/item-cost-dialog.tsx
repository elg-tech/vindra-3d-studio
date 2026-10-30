"use client";

import { AlertTriangle, Calculator, Save } from "lucide-react";
import { type ReactNode, useMemo, useState, useTransition } from "react";
import { useForm, useWatch } from "react-hook-form";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { type CalcFormValues, EMPTY_FORM, formToSheet, sheetToForm } from "@/lib/calculator-form";
import type { PricingContext } from "@/lib/cost-sheet";
import { formatCurrency, formatNumber } from "@/lib/format";
import { type ItemCost, evaluateItemCost, itemMargin } from "@/lib/item-cost";
import { parseDecimal } from "@/lib/numbers";
import { cn } from "@/lib/utils";
import { saveCostSheet } from "./actions";
import { CostBreakdown } from "./cost-breakdown";
import { SheetFields, type SupplyOption } from "./sheet-fields";

const field = (n: number) => (n === 0 ? "" : String(n).replace(".", ","));

/**
 * Custo do item avulso (orçamento, pedido novo ou pedido existente): mini calculadora ou custo manual.
 * Só devolve o custo; o preço do item nunca muda aqui.
 */
export function ItemCostDialog({
  ctx,
  supplies,
  description,
  quantity,
  unitPrice,
  value,
  onSave,
  trigger,
}: {
  ctx: PricingContext;
  supplies: SupplyOption[];
  description: string;
  quantity: number;
  unitPrice: number;
  value: ItemCost | null;
  /** true fecha o diálogo. cost null = remover o custo. */
  onSave: (cost: ItemCost | null) => boolean | Promise<boolean>;
  trigger: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="sm:max-w-2xl">
        {/* recriado a cada abertura: começa do custo salvo do item */}
        {open && (
          <ItemCostBody
            ctx={ctx}
            supplies={supplies}
            description={description}
            quantity={quantity}
            unitPrice={unitPrice}
            value={value}
            onSave={async (cost) => {
              if (await onSave(cost)) setOpen(false);
            }}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

function ItemCostBody({
  ctx,
  supplies,
  description,
  quantity,
  unitPrice,
  value,
  onSave,
}: {
  ctx: PricingContext;
  supplies: SupplyOption[];
  description: string;
  quantity: number;
  unitPrice: number;
  value: ItemCost | null;
  onSave: (cost: ItemCost | null) => Promise<void>;
}) {
  const [tab, setTab] = useState<ItemCost["source"]>(value?.source ?? "calc");
  const [isPending, startTransition] = useTransition();
  const [isSavingSheet, startSavingSheet] = useTransition();
  const [manualCost, setManualCost] = useState(value?.source === "manual" ? field(value.cost) : "");
  const [manualLabor, setManualLabor] = useState(value?.source === "manual" ? field(value.labor) : "");

  const defaultPrinter = ctx.printers.find((p) => p.is_default) ?? ctx.printers[0];
  const form = useForm<CalcFormValues>({
    defaultValues:
      value?.source === "calc"
        ? sheetToForm({ ...value.sheet, id: "", name: description, notes: null, sourceFilePath: null })
        : { ...EMPTY_FORM, printerId: defaultPrinter?.id ?? "" },
  });
  const values = useWatch({ control: form.control }) as CalcFormValues;
  const { sheet, errors } = useMemo(() => formToSheet(values, ctx.spools), [values, ctx.spools]);

  const manual = { cost: parseDecimal(manualCost), labor: manualLabor.trim() === "" ? 0 : parseDecimal(manualLabor) };
  const manualError =
    manual.cost === null
      ? "Informe o custo por peça."
      : manual.labor === null
        ? "Mão de obra: número inválido."
        : manual.cost < 0 || manual.labor < 0
          ? "Não pode ser negativo."
          : null;

  const candidate: ItemCost | null =
    tab === "calc"
      ? // formToSheet só produz materiais da lista (o servidor valida de novo)
        ({ source: "calc", sheet } as ItemCost)
      : manualError
        ? null
        : { source: "manual", cost: manual.cost!, labor: manual.labor! };
  // conta barata (sem I/O): refaz a cada digitação, como a calculadora
  const evaluation = candidate ? evaluateItemCost(candidate, quantity, ctx) : null;
  const blocking = tab === "calc" ? (errors[0] ?? (evaluation && !evaluation.ok ? evaluation.message : null)) : manualError;
  const margin = evaluation?.ok ? itemMargin(quantity, unitPrice, evaluation.unitCost) : null;

  function save() {
    if (blocking || !candidate) {
      toast.error(blocking ?? "Custo inválido.");
      return;
    }
    startTransition(() => onSave(candidate));
  }

  function saveAsSheet() {
    if (blocking) {
      toast.error(blocking);
      return;
    }
    startSavingSheet(async () => {
      const result = await saveCostSheet({
        ...sheet,
        quantity: Math.max(1, Math.round(quantity)),
        name: description.trim() || "Item avulso",
        notes: null,
        sourceFilePath: null,
      });
      if (!result.ok) toast.error(result.error);
      else toast.success("Ficha salva na calculadora. Este item continua com o custo calculado aqui.");
    });
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle>Custo do item</DialogTitle>
        <DialogDescription>
          {description || "Item avulso"} · {quantity} {quantity === 1 ? "peça" : "peças"} · preço {formatCurrency(unitPrice)}/peça (não
          muda).
        </DialogDescription>
      </DialogHeader>

      <Tabs value={tab} onValueChange={(v) => setTab(v as ItemCost["source"])} className="gap-4">
        <TabsList className="w-full">
          <TabsTrigger value="calc">Calcular custo</TabsTrigger>
          <TabsTrigger value="manual">Custo manual</TabsTrigger>
        </TabsList>
        <TabsContent value="calc">
          <SheetFields form={form} ctx={ctx} supplies={supplies} compact hideQuantity />
        </TabsContent>
        <TabsContent value="manual" className="grid gap-4 sm:grid-cols-2">
          <div className="grid content-start gap-1.5">
            <Label htmlFor="manual-cost">Custo por peça</Label>
            <MoneyInput id="manual-cost" value={manualCost} onChange={setManualCost} />
            <p className="text-xs text-muted-foreground">Filamento, máquina, insumos e embalagem.</p>
          </div>
          <div className="grid content-start gap-1.5">
            <Label htmlFor="manual-labor">Mão de obra por peça (opcional)</Label>
            <MoneyInput id="manual-labor" value={manualLabor} onChange={setManualLabor} />
            <p className="text-xs text-muted-foreground">Soma no custo; o DRE mostra o lucro sem a sua hora.</p>
          </div>
        </TabsContent>
      </Tabs>

      <div className="grid gap-3 rounded-lg bg-muted/50 p-3 text-sm" aria-live="polite">
        {evaluation?.ok ? (
          <>
            <dl className="grid grid-cols-[1fr_auto] gap-y-1">
              <dt className="font-medium">Custo por peça</dt>
              <dd className="text-right font-semibold tabular-nums">{formatCurrency(evaluation.unitCost)}</dd>
              {evaluation.unitLaborCost > 0 && (
                <>
                  <dt className="text-muted-foreground">da sua hora</dt>
                  <dd className="text-right tabular-nums">{formatCurrency(evaluation.unitLaborCost)}</dd>
                </>
              )}
              {margin && (
                <>
                  <dt className="text-muted-foreground">Lucro do item (antes de taxas e imposto)</dt>
                  <dd className={cn("text-right tabular-nums", margin.profit < 0 ? "text-destructive" : "text-success")}>
                    {formatCurrency(margin.profit)}
                    {margin.marginPct !== null && ` (${formatNumber(Math.round(margin.marginPct * 10) / 10)}%)`}
                  </dd>
                </>
              )}
            </dl>
            {tab === "calc" && evaluation.result && (
              <details>
                <summary className="cursor-pointer text-xs text-muted-foreground">Ver composição do custo</summary>
                <div className="pt-3">
                  <CostBreakdown unit={evaluation.result.unit} />
                </div>
              </details>
            )}
          </>
        ) : (
          <p className="text-muted-foreground">{blocking ?? "Preencha para ver o custo."}</p>
        )}
        {tab === "calc" && evaluation && evaluation.warnings.length > 0 && (
          <ul className="grid gap-1 text-xs">
            {evaluation.warnings.map((w) => (
              <li key={w} className="flex gap-2">
                <AlertTriangle className="mt-0.5 size-3.5 shrink-0 text-warning" aria-hidden />
                {w}
              </li>
            ))}
          </ul>
        )}
      </div>

      <DialogFooter className="sm:justify-between">
        <div className="flex flex-col-reverse gap-2 sm:flex-row">
          {value && (
            <Button type="button" variant="ghost" disabled={isPending} onClick={() => startTransition(() => onSave(null))}>
              Remover custo
            </Button>
          )}
          {tab === "calc" && (
            <Button type="button" variant="outline" disabled={isSavingSheet} onClick={saveAsSheet}>
              <Save aria-hidden /> Salvar como ficha
            </Button>
          )}
        </div>
        <Button type="button" disabled={isPending} onClick={save}>
          <Calculator aria-hidden /> Usar este custo
        </Button>
      </DialogFooter>
    </>
  );
}

/** Custo, lucro e margem do item ao vivo; sem custo, o selo amarelo. */
export function ItemCostSummary({ unitCost, quantity, unitPrice }: { unitCost: number | null; quantity: number; unitPrice: number }) {
  if (unitCost === null) return <NoCostBadge />;
  const { profit, marginPct } = itemMargin(quantity, unitPrice, unitCost);
  return (
    <span className="text-xs text-muted-foreground tabular-nums">
      custo {formatCurrency(unitCost)}/peça · lucro{" "}
      <span className={cn(profit < 0 ? "text-destructive" : "text-success")}>{formatCurrency(profit)}</span>
      {marginPct !== null && ` (${formatNumber(Math.round(marginPct * 10) / 10)}%)`}
    </span>
  );
}

export function NoCostBadge() {
  return (
    <span className="inline-flex w-fit items-center gap-1 rounded-md border border-warning/40 bg-warning/10 px-1.5 py-0.5 text-xs font-medium">
      <AlertTriangle className="size-3 text-warning" aria-hidden /> Sem custo
    </span>
  );
}

function MoneyInput({ id, value, onChange }: { id: string; value: string; onChange: (v: string) => void }) {
  return (
    <div className="relative">
      <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-sm text-muted-foreground">R$</span>
      <Input
        id={id}
        inputMode="decimal"
        autoComplete="off"
        className="pl-9 tabular-nums"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  );
}
