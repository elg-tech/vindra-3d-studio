"use client";

import { AlertTriangle, Plus, Trash2 } from "lucide-react";
import type { ReactNode } from "react";
import { Controller, type UseFormReturn, useFieldArray, useWatch } from "react-hook-form";
import { toast } from "sonner";
import { ColorDot } from "@/components/color-dot";
import { FieldShell, TextField } from "@/components/form/field";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { BambuPlate } from "@/lib/bambu3mf";
import { type CalcFormValues, materialSource, spoolSource } from "@/lib/calculator-form";
import { type PricingContext, matchSpool } from "@/lib/cost-sheet";
import { MATERIALS } from "@/lib/filaments";
import { formatCurrency, formatGrams, formatNumber, formatUnitCost } from "@/lib/format";
import {
  type PlateImport,
  colorName,
  combinePlates,
  filamentKey,
  importRows,
  materialMismatch,
  plateGrams,
  plateLabel,
  toStoredPlates,
} from "@/lib/plate-import";
import { cn } from "@/lib/utils";
import { Import3mf } from "./import-3mf";

export type SupplyOption = { id: string; name: string; unit: string; unit_cost: number; is_packaging: boolean };

const NONE = "none";

/** Card na calculadora; no diálogo do item (compact), uma seção simples. */
function Section({
  compact,
  title,
  description,
  className,
  children,
}: {
  compact?: boolean;
  title: string;
  description?: ReactNode;
  className?: string;
  children: ReactNode;
}) {
  if (compact) {
    return (
      <section className="grid gap-3 border-t pt-4 first:border-t-0 first:pt-0">
        <div className="grid gap-0.5">
          <h3 className="text-sm font-semibold">{title}</h3>
          {description && <p className="text-xs text-muted-foreground">{description}</p>}
        </div>
        <div className={className}>{children}</div>
      </section>
    );
  }
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        {description && <CardDescription>{description}</CardDescription>}
      </CardHeader>
      <CardContent className={className}>{children}</CardContent>
    </Card>
  );
}

function duration(seconds: number) {
  const total = Math.round(seconds / 60);
  const h = Math.floor(total / 60);
  return h > 0 ? `${h}h ${total % 60}min` : `${total}min`;
}

/** Mesas do .3mf: marcar quais entram (2+ = 1 kit), com o total e o detalhamento por mesa. */
function PlatesPanel({ value, onChange }: { value: PlateImport; onChange: (next: PlateImport) => void }) {
  const combined = combinePlates(value.plates, value.selected);
  const sliced = value.plates.filter((p) => p.sliced).map((p) => p.index);
  const toggle = (index: number, on: boolean) =>
    onChange({
      ...value,
      selected: on ? [...value.selected, index].sort((a, b) => a - b) : value.selected.filter((i) => i !== index),
    });

  return (
    <div className="grid gap-3 rounded-xl border p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="grid min-w-0 gap-0.5">
          <p className="text-sm font-medium break-words">Mesas de {value.fileName}</p>
          <p className="text-xs text-muted-foreground">
            Marque as que entram: 2 ou mais viram 1 kit (soma tempo e gramas). Trocar as mesas refaz o tempo e as gramas.
          </p>
        </div>
        <div className="flex gap-1">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={value.selected.length === sliced.length}
            onClick={() => onChange({ ...value, selected: sliced })}
          >
            Todas
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={value.selected.length === 0}
            onClick={() => onChange({ ...value, selected: [] })}
          >
            Nenhuma
          </Button>
        </div>
      </div>

      {combined.plates.length === 0 ? (
        <p role="alert" className="text-xs text-destructive">
          Marque pelo menos uma mesa.
        </p>
      ) : (
        <p className="flex flex-wrap items-baseline justify-between gap-x-3 rounded-lg bg-muted/50 px-3 py-2 text-sm">
          <span className="font-medium">
            Total{combined.plates.length > 1 && ` · ${combined.plates.length} mesas = 1 kit`}
          </span>
          <span className="tabular-nums">
            {duration(combined.printSeconds)} · {formatGrams(combined.grams)}
          </span>
        </p>
      )}

      <ul className="grid gap-1" aria-label="Mesas do arquivo">
        {value.plates.map((p) => (
          <li key={p.index}>
            <label
              className={cn(
                "flex min-h-11 items-center gap-3 rounded-lg px-2 py-1.5",
                p.sliced ? "cursor-pointer hover:bg-accent/50" : "cursor-not-allowed opacity-60",
              )}
            >
              <input
                type="checkbox"
                className="size-4 shrink-0 accent-primary"
                checked={value.selected.includes(p.index)}
                disabled={!p.sliced}
                onChange={(e) => toggle(p.index, e.target.checked)}
              />
              <span className="grid min-w-0 flex-1">
                <span className="truncate text-sm font-medium">{plateLabel(p)}</span>
                <span className="text-xs text-muted-foreground tabular-nums">
                  {p.sliced ? `${duration(p.printSeconds)} · ${formatGrams(plateGrams(p))}` : "não fatiada"}
                </span>
              </span>
              <span className="flex shrink-0 flex-wrap justify-end gap-1">
                {p.filaments.map((f) => (
                  <ColorDot key={filamentKey(f)} hex={f.color} label={`${colorName(f.color)} (${f.type || f.material})`} />
                ))}
              </span>
            </label>
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * Campos da ficha de custo: impressão, filamentos, mão de obra, embalagem e insumos, com a importação do .3mf.
 * Usado pela calculadora e pela mini calculadora do item avulso (orçamento e pedido).
 */
export function SheetFields({
  form,
  ctx,
  supplies,
  compact,
  hideQuantity,
  onImported,
}: {
  form: UseFormReturn<CalcFormValues>;
  ctx: PricingContext;
  supplies: SupplyOption[];
  compact?: boolean;
  /** Item avulso: a quantidade é a do item. */
  hideQuantity?: boolean;
  /** Depois de preencher os campos com as mesas importadas (a calculadora guarda o arquivo e sugere o nome). */
  onImported?: (suggestedName: string, file: File) => void;
}) {
  const { control, register, setValue, getValues } = form;
  const filaments = useFieldArray({ control, name: "filaments" });
  const extras = useFieldArray({ control, name: "extras" });
  const plateImport = useWatch({ control, name: "plateImport" });
  const rows = useWatch({ control, name: "filaments" });

  // carretel que acabou só aparece na linha que já o usa (ficha antiga), para o campo não ficar em branco
  const visibleSpools = (value: string) =>
    ctx.spools.filter((s) => s.status !== "empty" || value === spoolSource(s.id));
  const packaging = supplies.filter((s) => s.is_packaging);
  const others = supplies.filter((s) => !s.is_packaging);

  /**
   * Aplica as mesas marcadas: soma tempo e gramas por filamento do arquivo. Com 2+ mesas o conjunto é 1 kit
   * (peças por mesa = 1, editável). Os carretéis já escolhidos para o mesmo filamento do arquivo ficam.
   */
  function applyPlates(next: PlateImport) {
    setValue("plateImport", next, { shouldDirty: true });
    if (next.selected.length === 0) return;
    const combined = combinePlates(next.plates, next.selected);
    const total = Math.round(combined.printSeconds / 60);
    setValue("printHours", String(Math.floor(total / 60)));
    setValue("printMins", String(total % 60));
    setValue("purgeG", "");
    if (combined.plates.length > 1) setValue("piecesPerPlate", "1");
    filaments.replace(importRows(combined.filaments, ctx.spools, getValues("filaments"), formatNumber));
  }

  function onImport(plates: BambuPlate[], file: File) {
    const sliced = plates.filter((p) => p.sliced);
    // arquivo novo: nada de carretel escolhido para outro arquivo
    filaments.replace([{ source: materialSource("PLA"), grams: "" }]);
    applyPlates({ fileName: file.name, plates: toStoredPlates(plates), selected: sliced.map((p) => p.index) });
    const first = sliced[0];
    onImported?.(first?.objects[0] ?? first?.name ?? file.name.replace(/(\.gcode)?\.3mf$/i, ""), file);

    const combined = combinePlates(toStoredPlates(plates), sliced.map((p) => p.index));
    const unmatched = combined.filaments.filter((f) => !matchSpool(f.material, f.color, ctx.spools)).length;
    toast.success(
      sliced.length === 1
        ? `Mesa ${first.index} importada: ${combined.filaments.length} filamento(s), ${duration(combined.printSeconds)}.`
        : `${sliced.length} mesas importadas como 1 kit: ${combined.filaments.length} filamento(s), ${duration(combined.printSeconds)}.`,
      {
        description:
          (unmatched > 0 ? `${unmatched} sem carretel da mesma cor no estoque: usando a média do material. ` : "") +
          (sliced.length > 1 ? "Desmarque as mesas que não entram. " : "") +
          "Confira se a purga já está somada nas gramas e quantas peças cabem por mesa.",
        duration: 8000,
      },
    );
  }

  return (
    <div className="grid gap-4">
      <Import3mf onImport={onImport} />
      {plateImport && <PlatesPanel value={plateImport} onChange={applyPlates} />}

      <Section compact={compact} title="Impressão" description="Tempo de uma mesa, como o fatiador mostra." className="grid gap-4 sm:grid-cols-2">
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
        {/* content-start: sem ele a linha do grid estica até a altura do vizinho e "h"/"min" descem */}
        <fieldset className="grid content-start gap-1.5">
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
        <div className={cn("grid gap-2", !hideQuantity && "grid-cols-2")}>
          <TextField
            label="Peças por mesa"
            registration={register("piecesPerPlate")}
            numeric
            inputMode="numeric"
            hint="Tempo e filamento se dividem."
          />
          {!hideQuantity && (
            <TextField label="Quantidade" registration={register("quantity")} numeric inputMode="numeric" hint="Peças no lote." />
          )}
        </div>
      </Section>

      <Section
        compact={compact}
        title="Filamentos"
        description="Gramas por mesa. Escolha o carretel ou use a média do material."
        className="grid gap-3"
      >
        {filaments.fields.map((row, i) => {
          const current = rows?.[i];
          const spool = current?.source.startsWith("spool:") ? ctx.spools.find((s) => spoolSource(s.id) === current.source) : undefined;
          const chosenMaterial = spool?.material ?? (current?.source.startsWith("material:") ? current.source.slice(9) : undefined);
          const mismatch = materialMismatch(current?.fileMaterial, chosenMaterial);
          return (
            <div key={row.id} className="grid gap-1.5">
              {current?.fileColor && (
                <p className="flex flex-wrap items-center gap-x-1.5 text-xs text-muted-foreground">
                  <span>Cor no arquivo:</span>
                  <ColorDot hex={current.fileColor} className="align-[-2px]" />
                  <span className="font-medium text-foreground">
                    {colorName(current.fileColor)} ({current.fileType || current.fileMaterial})
                  </span>
                  <span className="tabular-nums">· {current.grams} g</span>
                  <span aria-hidden>→ Usar:</span>
                </p>
              )}
              <div className="grid grid-cols-[minmax(0,1fr)_6.5rem_auto] items-end gap-2">
                {/* min-w-0 + block/truncate: no celular o nome longo termina em "…" em vez de passar por baixo das gramas */}
                <FieldShell label={`Filamento ${i + 1}`} className="min-w-0">
                  {({ id }) => (
                    <Controller
                      control={control}
                      name={`filaments.${i}.source`}
                      render={({ field }) => (
                        <Select
                          value={field.value}
                          onValueChange={(v) => {
                            field.onChange(v);
                            setValue(`filaments.${i}.spoolRemoved`, false);
                          }}
                        >
                          <SelectTrigger
                            id={id}
                            className="w-full min-w-0 *:data-[slot=select-value]:block *:data-[slot=select-value]:min-w-0 *:data-[slot=select-value]:truncate"
                          >
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {visibleSpools(field.value).length > 0 && (
                              <SelectGroup>
                                <SelectLabel>Carretéis</SelectLabel>
                                {visibleSpools(field.value).map((s) => (
                                  <SelectItem key={s.id} value={spoolSource(s.id)}>
                                    <ColorDot hex={s.color_hex} className="mr-1.5 align-[-3px]" />
                                    {s.material} {s.color_name}
                                    {s.status === "empty" && " (acabou)"}
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
                                      : ctx.lastMaterialCosts[m] !== undefined
                                        ? ` · sem estoque, último ${formatUnitCost(ctx.lastMaterialCosts[m])}/g`
                                        : " · nunca comprado"}
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
              {mismatch && (
                <p role="note" className="flex gap-1.5 text-xs">
                  <AlertTriangle className="mt-0.5 size-3.5 shrink-0 text-warning" aria-hidden />
                  {mismatch}
                </p>
              )}
            </div>
          );
        })}
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
            hint="Deixe 0 se o fatiador já somou purga e torre nas gramas."
          />
        </div>
      </Section>

      <Section
        compact={compact}
        title="Mão de obra"
        description={
          ctx.settings.labor_hour_rate === null
            ? "Configure o valor da sua hora em Configurações → Custos."
            : `Sua hora: ${formatCurrency(ctx.settings.labor_hour_rate)}.`
        }
        className="grid gap-4 sm:grid-cols-2"
      >
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
      </Section>

      <Section compact={compact} title="Embalagem e insumos" description="Valores por peça." className="grid gap-4">
        <div className="flex flex-wrap items-end gap-2">
          <TextField label="Embalagem" registration={register("packagingCost")} numeric prefix="R$" className="w-40" />
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
              <Input id={`extra-cost-${i}`} inputMode="decimal" className="tabular-nums" {...register(`extras.${i}.unitCost`)} />
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
      </Section>
    </div>
  );
}
