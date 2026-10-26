"use client";

import { AlertTriangle, FilePlus2, Plus, Save, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { Controller, useFieldArray, useForm, useWatch } from "react-hook-form";
import { toast } from "sonner";
import { ColorDot } from "@/components/color-dot";
import { FieldShell, TextField } from "@/components/form/field";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { BambuPlate } from "@/lib/bambu3mf";
import { type CalcFormValues, EMPTY_FORM, formToSheet, materialSource, spoolSource } from "@/lib/calculator-form";
import { type PricingContext, matchSpool, toCostInput } from "@/lib/cost-sheet";
import { MATERIALS } from "@/lib/filaments";
import { formatCurrency, formatGrams, formatNumber, formatUnitCost } from "@/lib/format";
import { parseDecimal } from "@/lib/numbers";
import { type CostResult, PricingInputError, calculateCost } from "@/lib/pricing";
import { createClient } from "@/lib/supabase/client";
import { saveCostSheet } from "./actions";
import { ChannelPrices } from "./channel-prices";
import { CostBreakdown } from "./cost-breakdown";
import { Import3mf } from "./import-3mf";

export type SupplyOption = { id: string; name: string; unit: string; unit_cost: number; is_packaging: boolean };

const NONE = "none";

export function Calculator({
  ctx,
  supplies,
  initial,
  userId,
}: {
  ctx: PricingContext;
  supplies: SupplyOption[];
  initial: CalcFormValues | null;
  userId: string;
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
  const filaments = useFieldArray({ control, name: "filaments" });
  const extras = useFieldArray({ control, name: "extras" });
  const values = useWatch({ control }) as CalcFormValues;

  const { sheet, errors } = useMemo(() => formToSheet(values, ctx.spools), [values, ctx.spools]);
  const calc = useMemo((): { result: CostResult } | { error: string } => {
    try {
      return { result: calculateCost(toCostInput(sheet, ctx)) };
    } catch (e) {
      if (e instanceof PricingInputError) return { error: e.message };
      throw e;
    }
  }, [sheet, ctx]);

  const marginN = parseDecimal(marginPct);
  const margin = marginN !== null && marginN >= 0 && marginN < 100 ? marginN : ctx.settings.default_margin_pct;
  const activeSpools = ctx.spools.filter((s) => s.status !== "empty");
  const packaging = supplies.filter((s) => s.is_packaging);
  const others = supplies.filter((s) => !s.is_packaging);

  function onImport(plate: BambuPlate, file: File) {
    const total = Math.round(plate.printSeconds / 60);
    setValue("printHours", String(Math.floor(total / 60)));
    setValue("printMins", String(total % 60));
    setValue("purgeG", "");
    const matched = plate.filaments.map((f) => {
      const spool = matchSpool(f.material, f.color, ctx.spools);
      return {
        source: spool ? spoolSource(spool.id) : materialSource(f.material),
        grams: formatNumber(f.grams),
        spool,
        f,
      };
    });
    filaments.replace(matched.map(({ source, grams }) => ({ source, grams })));
    if (!values.name) setValue("name", plate.objects[0] ?? file.name.replace(/(\.gcode)?\.3mf$/i, ""));
    setPendingFile(file);

    const unmatched = matched.filter((m) => !m.spool).length;
    toast.success(`Mesa ${plate.index} importada: ${matched.length} filamento(s), ${Math.floor(total / 60)}h ${total % 60}min.`, {
      description:
        (unmatched > 0 ? `${unmatched} sem carretel da mesma cor no estoque: usando a média do material. ` : "") +
        "Os gramas do Bambu Studio já incluem a purga. Confira as peças por mesa.",
      duration: 8000,
    });
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
    if ("error" in calc) {
      toast.error(calc.error);
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

  const result = "result" in calc ? calc.result : null;

  return (
    <form onSubmit={onSave} noValidate className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,26rem)] lg:items-start">
      <div className="grid gap-4">
        <Import3mf onImport={onImport} />

        <Card>
          <CardHeader>
            <CardTitle>Impressão</CardTitle>
            <CardDescription>Tempo de uma mesa, como o fatiador mostra.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <FieldShell label="Impressora" className="sm:col-span-2">
              {({ id }) => (
                <Controller
                  control={control}
                  name="printerId"
                  render={({ field }) => (
                    <Select value={field.value || NONE} onValueChange={(v) => field.onChange(v === NONE ? "" : v)}>
                      <SelectTrigger id={id} className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {ctx.printers.map((p) => (
                          <SelectItem key={p.id} value={p.id}>
                            {p.name}
                          </SelectItem>
                        ))}
                        <SelectItem value={NONE}>Sem impressora</SelectItem>
                      </SelectContent>
                    </Select>
                  )}
                />
              )}
            </FieldShell>
            <fieldset className="grid gap-1.5">
              <legend className="mb-1.5 text-sm font-medium">Tempo de impressão (por mesa)</legend>
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <Input aria-label="Horas" inputMode="numeric" className="pr-8 tabular-nums" {...register("printHours")} />
                  <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-sm text-muted-foreground">
                    h
                  </span>
                </div>
                <div className="relative flex-1">
                  <Input aria-label="Minutos" inputMode="numeric" className="pr-12 tabular-nums" {...register("printMins")} />
                  <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-sm text-muted-foreground">
                    min
                  </span>
                </div>
              </div>
            </fieldset>
            <div className="grid grid-cols-2 gap-2">
              <TextField
                label="Peças por mesa"
                registration={register("piecesPerPlate")}
                numeric
                inputMode="numeric"
                hint="Tempo e filamento se dividem."
              />
              <TextField label="Quantidade" registration={register("quantity")} numeric inputMode="numeric" hint="Peças no lote." />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Filamentos</CardTitle>
            <CardDescription>Gramas por mesa. Escolha o carretel ou use a média do material.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3">
            {filaments.fields.map((row, i) => (
              <div key={row.id} className="grid grid-cols-[minmax(0,1fr)_6.5rem_auto] items-end gap-2">
                <FieldShell label={`Filamento ${i + 1}`}>
                  {({ id }) => (
                    <Controller
                      control={control}
                      name={`filaments.${i}.source`}
                      render={({ field }) => (
                        <Select value={field.value} onValueChange={field.onChange}>
                          <SelectTrigger id={id} className="w-full">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {activeSpools.length > 0 && (
                              <SelectGroup>
                                <SelectLabel>Carretéis</SelectLabel>
                                {activeSpools.map((s) => (
                                  <SelectItem key={s.id} value={spoolSource(s.id)}>
                                    <ColorDot hex={s.color_hex} />
                                    {s.material} {s.color_name}
                                    <span className="text-muted-foreground tabular-nums">
                                      {s.cost_per_gram !== null && ` · ${formatUnitCost(s.cost_per_gram)}/g`}
                                    </span>
                                  </SelectItem>
                                ))}
                              </SelectGroup>
                            )}
                            <SelectGroup>
                              <SelectLabel>Média do material</SelectLabel>
                              {MATERIALS.map((m) => (
                                <SelectItem key={m} value={materialSource(m)}>
                                  {m} (média)
                                  <span className="text-muted-foreground tabular-nums">
                                    {ctx.materialAverages[m] !== undefined
                                      ? ` · ${formatUnitCost(ctx.materialAverages[m])}/g`
                                      : " · sem estoque"}
                                  </span>
                                </SelectItem>
                              ))}
                            </SelectGroup>
                          </SelectContent>
                        </Select>
                      )}
                    />
                  )}
                </FieldShell>
                <div className="relative">
                  <Input
                    aria-label={`Gramas do filamento ${i + 1}`}
                    inputMode="decimal"
                    autoComplete="off"
                    className="pr-7 tabular-nums"
                    {...register(`filaments.${i}.grams`)}
                  />
                  <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-sm text-muted-foreground">
                    g
                  </span>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label={`Remover filamento ${i + 1}`}
                  disabled={filaments.fields.length === 1}
                  onClick={() => filaments.remove(i)}
                >
                  <Trash2 aria-hidden />
                </Button>
              </div>
            ))}
            <div className="flex flex-wrap items-end justify-between gap-3">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => filaments.append({ source: materialSource("PLA"), grams: "" })}
                disabled={filaments.fields.length >= 16}
              >
                <Plus aria-hidden /> Filamento
              </Button>
              <TextField
                label="Desperdício / purga (por mesa)"
                registration={register("purgeG")}
                numeric
                suffix="g"
                className="w-48"
                hint="Na importação do Bambu já vem incluso."
              />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Mão de obra</CardTitle>
            <CardDescription>
              {ctx.settings.labor_hour_rate === null
                ? "Configure o valor da sua hora em Configurações → Custos."
                : `Sua hora: ${formatCurrency(ctx.settings.labor_hour_rate)}.`}
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <TextField
              label="Preparação e fatiamento (por lote)"
              registration={register("prepMinutes")}
              numeric
              inputMode="numeric"
              suffix="min"
            />
            <TextField
              label="Pós-processamento (por peça)"
              registration={register("postMinutes")}
              numeric
              inputMode="numeric"
              suffix="min"
              hint="Lixar, montar, pintar."
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Embalagem e insumos</CardTitle>
            <CardDescription>Valores por peça.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4">
            <div className="flex flex-wrap items-end gap-2">
              <TextField
                label="Embalagem"
                registration={register("packagingCost")}
                numeric
                prefix="R$"
                className="w-40"
              />
              {packaging.length > 0 && (
                <Select
                  value=""
                  onValueChange={(id) => {
                    const s = packaging.find((p) => p.id === id);
                    if (s) setValue("packagingCost", formatNumber(s.unit_cost));
                  }}
                >
                  <SelectTrigger aria-label="Usar embalagem cadastrada" className="w-auto">
                    <SelectValue placeholder="Usar cadastrada…" />
                  </SelectTrigger>
                  <SelectContent>
                    {packaging.map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.name} · {formatCurrency(p.unit_cost)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>

            {extras.fields.map((row, i) => (
              <div key={row.id} className="grid grid-cols-[minmax(0,1fr)_4.5rem_6.5rem_auto] items-end gap-2">
                <div className="grid gap-1.5">
                  <Label htmlFor={`extra-name-${i}`}>Insumo</Label>
                  <Input id={`extra-name-${i}`} {...register(`extras.${i}.name`)} />
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor={`extra-qty-${i}`}>Qtd.</Label>
                  <Input id={`extra-qty-${i}`} inputMode="decimal" className="tabular-nums" {...register(`extras.${i}.quantity`)} />
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor={`extra-cost-${i}`}>Custo un.</Label>
                  <Input
                    id={`extra-cost-${i}`}
                    inputMode="decimal"
                    className="tabular-nums"
                    {...register(`extras.${i}.unitCost`)}
                  />
                </div>
                <Button type="button" variant="ghost" size="icon" aria-label={`Remover insumo ${i + 1}`} onClick={() => extras.remove(i)}>
                  <Trash2 aria-hidden />
                </Button>
              </div>
            ))}

            <Select
              value=""
              onValueChange={(id) => {
                const s = others.find((o) => o.id === id);
                extras.append(
                  s
                    ? { supplyId: s.id, name: s.name, quantity: "1", unitCost: formatNumber(s.unit_cost) }
                    : { supplyId: "", name: "", quantity: "1", unitCost: "" },
                );
              }}
            >
              <SelectTrigger aria-label="Adicionar insumo" className="w-fit" disabled={extras.fields.length >= 30}>
                <Plus aria-hidden />
                <SelectValue placeholder="Adicionar insumo" />
              </SelectTrigger>
              <SelectContent>
                {others.map((o) => (
                  <SelectItem key={o.id} value={o.id}>
                    {o.name} · {formatUnitCost(o.unit_cost)}/{o.unit}
                  </SelectItem>
                ))}
                <SelectItem value="custom">Personalizado…</SelectItem>
              </SelectContent>
            </Select>
          </CardContent>
        </Card>
      </div>

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
            {"error" in calc ? (
              <p role="alert" className="text-sm text-destructive">
                {calc.error}
              </p>
            ) : (
              <CostBreakdown unit={calc.result.unit} />
            )}
            {(errors.length > 0 || (result && result.warnings.length > 0)) && (
              <ul className="grid gap-1 rounded-lg border border-warning/40 bg-warning/10 p-3 text-xs">
                {[...errors, ...(result?.warnings ?? [])].map((w) => (
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
                <span className="relative">
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
            {result && <ChannelPrices unitCost={result.unit.total} ctx={ctx} marginPct={margin} />}
          </CardContent>
        </Card>

        <Card>
          <CardContent className="grid gap-3 pt-6">
            <TextField
              label="Nome da ficha"
              registration={register("name")}
              error={form.formState.errors.name}
              placeholder="Suporte de controle Xbox"
            />
            {pendingFile && (
              <p className="text-xs text-muted-foreground">O arquivo {pendingFile.name} será guardado junto com a ficha.</p>
            )}
            <div className="flex flex-wrap gap-2">
              <Button type="submit" disabled={isSaving} className="flex-1">
                <Save aria-hidden /> {values.id ? "Atualizar ficha" : "Salvar ficha"}
              </Button>
              <Button type="button" variant="outline" onClick={newSheet}>
                <FilePlus2 aria-hidden /> Nova
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Resumo fixo no celular */}
      {result && (
        <a
          href="#resultado"
          className="fixed inset-x-4 bottom-[calc(4.5rem+env(safe-area-inset-bottom))] z-30 flex items-center justify-between rounded-full border bg-card/95 px-4 py-2 text-sm shadow-lg backdrop-blur lg:hidden"
        >
          <span className="text-muted-foreground">Custo por peça</span>
          <strong className="tabular-nums">{formatCurrency(result.unit.total)}</strong>
        </a>
      )}
    </form>
  );
}
