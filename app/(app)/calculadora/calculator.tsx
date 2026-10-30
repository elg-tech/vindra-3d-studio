"use client";

import { AlertTriangle, FilePlus2, Link2, Save } from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { useForm, useWatch } from "react-hook-form";
import { toast } from "sonner";
import { TextField } from "@/components/form/field";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { BambuPlate } from "@/lib/bambu3mf";
import { type CalcFormValues, EMPTY_FORM, formToSheet } from "@/lib/calculator-form";
import { type PricingContext, evaluateSheet } from "@/lib/cost-sheet";
import { formatCurrency, formatGrams, formatNumber } from "@/lib/format";
import { parseDecimal } from "@/lib/numbers";
import { type SheetUsage, usageLabel } from "@/lib/products";
import { createClient } from "@/lib/supabase/client";
import { saveCostSheet } from "./actions";
import { ChannelPrices } from "./channel-prices";
import { CostBreakdown } from "./cost-breakdown";
import { type ProductOption, SaveAsProduct } from "./save-as-product";
import { SheetFields, type SupplyOption } from "./sheet-fields";

export type { SupplyOption } from "./sheet-fields";

export function Calculator({
  ctx,
  supplies,
  initial,
  userId,
  usage,
  products,
}: {
  ctx: PricingContext;
  supplies: SupplyOption[];
  initial: CalcFormValues | null;
  userId: string;
  /** Variações que usam a ficha aberta: salvar muda o custo delas. */
  usage: SheetUsage[];
  products: ProductOption[];
}) {
  const router = useRouter();
  const [isSaving, startSaving] = useTransition();
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [marginPct, setMarginPct] = useState(String(ctx.settings.default_margin_pct).replace(".", ","));

  const defaultPrinter = ctx.printers.find((p) => p.is_default) ?? ctx.printers[0];
  const form = useForm<CalcFormValues>({
    defaultValues: initial ?? { ...EMPTY_FORM, printerId: defaultPrinter?.id ?? "" },
  });
  const { control, register, setValue, reset, handleSubmit } = form;
  const values = useWatch({ control }) as CalcFormValues;

  const { sheet, errors } = useMemo(() => formToSheet(values, ctx.spools), [values, ctx.spools]);
  // mesma regra dos produtos: carretel acabado/excluído, sem estoque, material nunca comprado
  const evaluation = useMemo(() => evaluateSheet(sheet, ctx), [sheet, ctx]);

  const marginN = parseDecimal(marginPct);
  const margin = marginN !== null && marginN >= 0 && marginN < 100 ? marginN : ctx.settings.default_margin_pct;

  // SheetFields já preencheu tempo e filamentos; aqui só o nome da ficha e o arquivo a guardar
  function onImported(plate: BambuPlate, file: File) {
    if (!values.name) setValue("name", plate.objects[0] ?? file.name.replace(/(\.gcode)?\.3mf$/i, ""));
    setPendingFile(file);
  }

  const onSave = handleSubmit((v) => {
    if (!v.name.trim()) {
      form.setError("name", { message: "Dê um nome para a ficha." });
      return;
    }
    if (errors.length > 0) {
      toast.error(errors[0]);
      return;
    }
    // sem custo de filamento pode salvar (o custo aparece quando houver carretel); ficha inválida não
    if (!evaluation.ok && evaluation.reason === "invalid") {
      toast.error(evaluation.message);
      return;
    }
    startSaving(async () => {
      let sourceFilePath = v.sourceFilePath || null;
      if (pendingFile) {
        const safeName = pendingFile.name.normalize("NFD").replace(/[^\w.-]+/g, "_").slice(-80);
        const path = `${userId}/3mf/${Date.now()}-${safeName}`;
        const { error } = await createClient().storage.from("files").upload(path, pendingFile, {
          contentType: "application/octet-stream",
        });
        if (error) {
          toast.error("Não foi possível enviar o .3mf. A ficha não foi salva.");
          return;
        }
        sourceFilePath = path;
      }

      const result = await saveCostSheet({
        ...sheet,
        id: v.id,
        name: v.name.trim(),
        notes: v.notes.trim() || null,
        sourceFilePath,
      });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success(result.message);
      setPendingFile(null);
      if (result.data) {
        setValue("id", result.data.id);
        if (sourceFilePath) setValue("sourceFilePath", sourceFilePath);
        router.replace(`/calculadora?ficha=${result.data.id}`, { scroll: false });
      }
    });
  });

  function newSheet() {
    reset({ ...EMPTY_FORM, printerId: defaultPrinter?.id ?? "" });
    setPendingFile(null);
    router.replace("/calculadora", { scroll: false });
  }

  const result = evaluation.ok ? evaluation.result : null;
  // sem filamento ou sem tempo o custo é só taxa fixa e embalagem: o preço sugerido enganaria
  const hasBasics = result !== null && result.grams > 0 && result.printHours > 0;
  const warnings = [...new Set([...errors, ...evaluation.warnings, ...(result?.warnings ?? [])])];

  return (
    <form onSubmit={onSave} noValidate className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,26rem)] lg:items-start">
      <SheetFields form={form} ctx={ctx} supplies={supplies} onImported={onImported} />

      {/* Resultado */}
      <div id="resultado" className="grid gap-4 lg:sticky lg:top-20">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-baseline justify-between gap-2">
              Custo
              {result && (
                <span className="text-sm font-normal text-muted-foreground tabular-nums">
                  lote: {formatCurrency(result.lot.total)}
                </span>
              )}
            </CardTitle>
            {result && (
              <CardDescription className="tabular-nums">
                {formatGrams(Math.round(result.grams * 10) / 10)} de filamento ·{" "}
                {formatNumber(Math.round(result.printHours * 10) / 10)} h de impressora · falha{" "}
                {formatNumber(ctx.settings.failure_margin_pct)}%
              </CardDescription>
            )}
          </CardHeader>
          <CardContent className="grid gap-4">
            {!evaluation.ok ? (
              <p role="alert" className="text-sm text-destructive">
                {evaluation.message}
              </p>
            ) : (
              <CostBreakdown unit={evaluation.result.unit} />
            )}
            {warnings.length > 0 && (
              <ul className="grid gap-1 rounded-lg border border-warning/40 bg-warning/10 p-3 text-xs">
                {warnings.map((w) => (
                  <li key={w} className="flex gap-2">
                    <AlertTriangle className="mt-0.5 size-3.5 shrink-0 text-warning" aria-hidden />
                    {w}
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center justify-between gap-3">
              Preço por canal
              <span className="flex items-center gap-2 text-sm font-normal">
                <Label htmlFor="margin">Margem</Label>
                <span className="relative inline-flex">
                  <Input
                    id="margin"
                    inputMode="decimal"
                    className="h-8 w-20 pr-6 tabular-nums"
                    value={marginPct}
                    onChange={(e) => setMarginPct(e.target.value)}
                  />
                  <span className="pointer-events-none absolute inset-y-0 right-2 flex items-center text-xs text-muted-foreground">
                    %
                  </span>
                </span>
              </span>
            </CardTitle>
            <CardDescription>Preço que garante a margem depois das taxas, arredondado para cima.</CardDescription>
          </CardHeader>
          <CardContent>
            <ChannelPrices
              unitCost={hasBasics ? result.unit.total : null}
              blockedMessage={
                !evaluation.ok && evaluation.reason === "no_filament_cost"
                  ? "Sem custo de filamento: cadastre um carretel do material para ver o preço."
                  : undefined
              }
              ctx={ctx}
              marginPct={margin}
            />
          </CardContent>
        </Card>

        <Card>
          <CardContent className="grid gap-3 pt-6">
            <TextField
              label="Nome da ficha"
              registration={register("name")}
              error={form.formState.errors.name}
              placeholder="ex.: Suporte de controle Xbox"
            />
            {pendingFile && (
              <p className="text-xs text-muted-foreground">O arquivo {pendingFile.name} será guardado junto com a ficha.</p>
            )}
            {values.id && usage.length > 0 && (
              <p role="note" className="flex gap-2 rounded-lg border border-warning/40 bg-warning/10 p-3 text-xs">
                <Link2 className="mt-0.5 size-3.5 shrink-0 text-warning" aria-hidden />
                <span>
                  <strong className="font-medium">
                    Usada em {usage.length} {usage.length === 1 ? "variação" : "variações"}:
                  </strong>{" "}
                  {usageLabel(usage)}. Salvar muda o custo {usage.length === 1 ? "dela" : "de todas"}.
                </span>
              </p>
            )}
            <div className="flex flex-wrap gap-2">
              <Button type="submit" disabled={isSaving} className="flex-1">
                <Save aria-hidden /> {values.id ? "Atualizar ficha" : "Salvar ficha"}
              </Button>
              <Button type="button" variant="outline" onClick={newSheet}>
                <FilePlus2 aria-hidden /> Nova
              </Button>
            </div>
            {values.id && (
              <SaveAsProduct sheetId={values.id} sheetName={values.name} products={products} />
            )}
          </CardContent>
        </Card>
      </div>

      {/* Resumo fixo no celular */}
      {result && (
        <a
          href="#resultado"
          className="fixed inset-x-4 bottom-[calc(4.5rem+env(safe-area-inset-bottom))] z-30 flex min-h-11 items-center justify-between rounded-full border bg-card/95 px-4 py-2 text-sm shadow-lg backdrop-blur lg:hidden"
        >
          <span className="text-muted-foreground">Custo por peça</span>
          <strong className="tabular-nums">{formatCurrency(result.unit.total)}</strong>
        </a>
      )}
    </form>
  );
}
