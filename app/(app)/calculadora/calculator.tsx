"use client";

import { AlertTriangle, FilePlus2, Link2, Plus, Save, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { type UseFormReturn, useFieldArray, useForm, useWatch } from "react-hook-form";
import { toast } from "sonner";
import { TextField } from "@/components/form/field";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { type CalcFormValues, EMPTY_FORM, formToSheet, parseKitSizes } from "@/lib/calculator-form";
import { type PricingContext, evaluateSheet } from "@/lib/cost-sheet";
import { formatCurrency } from "@/lib/format";
import { parseDecimal } from "@/lib/numbers";
import { type SheetUsage, usageLabel } from "@/lib/products";
import { createClient } from "@/lib/supabase/client";
import { saveCostSheet } from "./actions";
import { KitPrices, type ManualPrices, manualPrice } from "./kit-prices";
import { ProductionResult } from "./production-result";
import { type ProductOption, SaveAsProduct } from "./save-as-product";
import { OrderCostFields, SheetFields, type SupplyOption } from "./sheet-fields";

export type { SupplyOption } from "./sheet-fields";

/** "Peças por kit": lista editável (ex.: 1, 3, 5). */
function KitSizesField({ form }: { form: UseFormReturn<CalcFormValues> }) {
  const { control, register } = form;
  const kits = useFieldArray({ control, name: "kits" });
  return (
    <fieldset className="grid gap-2">
      <legend className="mb-1 text-sm font-medium">Peças por kit</legend>
      <div className="flex flex-wrap items-center gap-2">
        {kits.fields.map((row, i) => (
          <div key={row.id} className="flex items-center rounded-lg border bg-background">
            <Input
              aria-label={`Peças do kit ${i + 1}`}
              inputMode="numeric"
              autoComplete="off"
              className="h-9 w-14 border-0 text-center tabular-nums shadow-none focus-visible:ring-0"
              {...register(`kits.${i}.size`)}
            />
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="size-9"
              aria-label={`Remover kit ${i + 1}`}
              disabled={kits.fields.length === 1}
              onClick={() => kits.remove(i)}
            >
              <X aria-hidden />
            </Button>
          </div>
        ))}
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={kits.fields.length >= 10}
          onClick={() => kits.append({ size: "" }, { shouldFocus: true })}
        >
          <Plus aria-hidden /> Kit
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">Quantas vão no pacote do cliente. Cada kit tem o seu preço por canal.</p>
    </fieldset>
  );
}

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
  const [manualPrices, setManualPrices] = useState<ManualPrices>({});

  const defaultPrinter = ctx.printers.find((p) => p.is_default) ?? ctx.printers[0];
  const form = useForm<CalcFormValues>({
    defaultValues: initial ?? { ...EMPTY_FORM, printerId: defaultPrinter?.id ?? "" },
  });
  const { control, register, setValue, reset, handleSubmit } = form;
  const values = useWatch({ control }) as CalcFormValues;

  const { sheet, errors } = useMemo(() => formToSheet(values, ctx.spools), [values, ctx.spools]);
  // mesma regra dos produtos: carretel acabado/excluído, sem estoque, material nunca comprado
  const evaluation = useMemo(() => evaluateSheet(sheet, ctx), [sheet, ctx]);
  const kits = useMemo(() => parseKitSizes(values.kits ?? []), [values.kits]);

  const marginN = parseDecimal(marginPct);
  const margin = marginN !== null && marginN >= 0 && marginN < 100 ? marginN : ctx.settings.default_margin_pct;
  const plannedN = values.quantity?.trim() ? parseDecimal(values.quantity) : null;
  const plannedPieces = plannedN !== null && Number.isInteger(plannedN) && plannedN >= 1 ? plannedN : null;

  // SheetFields já preencheu tempo e filamentos; aqui só o nome da ficha e o arquivo a guardar
  function onImported(suggestedName: string, file: File) {
    if (!values.name) setValue("name", suggestedName);
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
    setManualPrices({});
    router.replace("/calculadora", { scroll: false });
  }

  const result = evaluation.ok ? evaluation.result : null;
  // sem filamento ou sem tempo o custo é só taxa fixa e embalagem: o preço sugerido enganaria
  const hasBasics = result !== null && result.grams > 0 && result.printHours > 0;
  const warnings = [...new Set([...errors, ...evaluation.warnings, ...(result?.warnings ?? [])])];
  const blockedMessage =
    !evaluation.ok && evaluation.reason === "no_filament_cost"
      ? "Sem custo de filamento: cadastre um carretel do material para ver o preço."
      : undefined;

  // preços manuais dos kits atuais, para criar as variações já com preço
  const kitDrafts = kits.map((n) => ({
    name: `Kit ${n}`,
    piecesPerKit: n,
    prices: ctx.channels.flatMap((c) => {
      const price = manualPrice(manualPrices, n, c.id);
      return price !== null ? [{ channelId: c.id, price }] : [];
    }),
  }));

  return (
    <form onSubmit={onSave} noValidate className="grid gap-8">
      {/* PRODUÇÃO */}
      <section aria-labelledby="bloco-producao" className="grid gap-4">
        <div>
          <h2 id="bloco-producao" className="text-lg font-semibold tracking-tight">
            1. Produção
          </h2>
          <p className="text-sm text-muted-foreground">Quanto custa fabricar uma peça.</p>
        </div>
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,26rem)] lg:items-start">
          <SheetFields form={form} ctx={ctx} supplies={supplies} onImported={onImported} />

          <div id="resultado" className="grid gap-4 lg:sticky lg:top-20">
            <Card>
              <CardHeader>
                <CardTitle>Custo de produção</CardTitle>
                <CardDescription>Mesa cheia ÷ peças por mesa, preparo ÷ peças produzidas, pós e insumos por peça.</CardDescription>
              </CardHeader>
              <CardContent className="grid gap-4">
                {!evaluation.ok ? (
                  <p role="alert" className="text-sm text-destructive">
                    {evaluation.message}
                  </p>
                ) : (
                  <ProductionResult
                    result={evaluation.result}
                    piecesPerPlate={sheet.piecesPerPlate}
                    plannedPieces={plannedPieces}
                    failureMarginPct={ctx.settings.failure_margin_pct}
                  />
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
                  <SaveAsProduct sheetId={values.id} sheetName={values.name} products={products} kits={kitDrafts} />
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      {/* VENDA */}
      <section aria-labelledby="bloco-venda" className="grid gap-4">
        <div>
          <h2 id="bloco-venda" className="text-lg font-semibold tracking-tight">
            2. Venda
          </h2>
          <p className="text-sm text-muted-foreground">
            Quanto cobrar por kit. A taxa fixa do canal e os custos do pedido entram uma vez por kit, não por peça.
          </p>
        </div>
        <div className="grid gap-4 lg:grid-cols-2 lg:items-start">
          <OrderCostFields form={form} ctx={ctx} supplies={supplies} />
          <Card>
            <CardHeader>
              <CardTitle>Kits e margem</CardTitle>
              <CardDescription>
                {result
                  ? `Custos por pedido: ${formatCurrency(result.order.total)} por kit.`
                  : "Defina os kits que você vende."}
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4">
              <KitSizesField form={form} />
              <div className="grid gap-1.5">
                <Label htmlFor="margin">Margem desejada</Label>
                <div className="relative w-28">
                  <Input
                    id="margin"
                    inputMode="decimal"
                    className="pr-7 tabular-nums"
                    value={marginPct}
                    onChange={(e) => setMarginPct(e.target.value)}
                  />
                  <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-sm text-muted-foreground">
                    %
                  </span>
                </div>
                <p className="text-xs text-muted-foreground">Preço que garante a margem depois das taxas, arredondado para cima.</p>
              </div>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Preço por kit e canal</CardTitle>
          </CardHeader>
          <CardContent>
            <KitPrices
              result={hasBasics ? result : null}
              blockedMessage={blockedMessage}
              ctx={ctx}
              marginPct={margin}
              kits={kits}
              prices={manualPrices}
              onPriceChange={(key, value) => setManualPrices((p) => ({ ...p, [key]: value }))}
            />
          </CardContent>
        </Card>
      </section>

      {/* Resumo fixo no celular */}
      {result && (
        <a
          href="#resultado"
          className="fixed inset-x-4 bottom-[calc(4.5rem+env(safe-area-inset-bottom))] z-30 flex min-h-11 items-center justify-between rounded-full border bg-card/95 px-4 py-2 text-sm shadow-lg backdrop-blur lg:hidden"
        >
          <span className="text-muted-foreground">Custo por peça</span>
          <strong className="tabular-nums">{formatCurrency(result.piece.total)}</strong>
        </a>
      )}
    </form>
  );
}
