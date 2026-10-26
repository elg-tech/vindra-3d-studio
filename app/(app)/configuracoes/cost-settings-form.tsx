"use client";

import { Controller } from "react-hook-form";
import { FieldShell, TextField } from "@/components/form/field";
import { SubmitButton } from "@/components/form/submit-button";
import { UnusualValuesDialog } from "@/components/form/unusual-values-dialog";
import { useActionForm } from "@/components/form/use-action-form";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { Tables } from "@/lib/supabase/database.types";
import { unusualValues } from "@/lib/unusual-values";
import { toField } from "@/lib/validation/fields";
import { costSettingsSchema } from "@/lib/validation/schemas";
import { saveCostSettings } from "./actions";

const ROUNDING_OPTIONS = [
  ["cents_90", "Terminar em ,90 (ex.: R$ 24,90)"],
  ["cents_99", "Terminar em ,99 (ex.: R$ 24,99)"],
  ["integer", "Valor inteiro (ex.: R$ 25,00)"],
  ["none", "Sem arredondamento"],
] as const;

export function CostSettingsForm({ settings }: { settings: Tables<"settings"> }) {
  const { form, onSubmit, isPending, confirmation } = useActionForm({
    schema: costSettingsSchema,
    action: saveCostSettings,
    checkUnusual: (v) =>
      unusualValues({ energy_rate_kwh: v.energy_rate_kwh, labor_hour_rate: v.labor_hour_rate }),
    defaultValues: {
      energy_rate_kwh: toField(settings.energy_rate_kwh),
      labor_hour_rate: toField(settings.labor_hour_rate),
      failure_margin_pct: toField(settings.failure_margin_pct),
      default_margin_pct: toField(settings.default_margin_pct),
      min_margin_pct: toField(settings.min_margin_pct),
      tax_pct: toField(settings.tax_pct),
      rounding_rule: settings.rounding_rule as (typeof ROUNDING_OPTIONS)[number][0],
    },
  });
  const { register, control, formState } = form;
  const e = formState.errors;

  return (
    <form onSubmit={onSubmit} noValidate>
      <UnusualValuesDialog {...confirmation} />
      <Card>
        <CardHeader>
          <CardTitle>Custos e margens</CardTitle>
          <CardDescription>Valores usados pela calculadora em todas as peças.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-5 sm:grid-cols-2">
          <TextField
            label="Tarifa de energia"
            registration={register("energy_rate_kwh")}
            error={e.energy_rate_kwh}
            numeric
            prefix="R$"
            suffix="/kWh"
            placeholder="0,85"
            hint="Valor final da sua conta de luz ÷ kWh consumidos (com impostos e bandeira)."
          />
          <TextField
            label="Valor da sua hora de trabalho"
            registration={register("labor_hour_rate")}
            error={e.labor_hour_rate}
            numeric
            prefix="R$"
            suffix="/h"
            placeholder="25,00"
            hint="Usado no preparo, fatiamento e pós-processamento."
          />
          <TextField
            label="Margem de falha"
            registration={register("failure_margin_pct")}
            error={e.failure_margin_pct}
            numeric
            suffix="%"
            hint="Acrescentada ao custo para cobrir impressões perdidas."
          />
          <TextField
            label="Imposto"
            registration={register("tax_pct")}
            error={e.tax_pct}
            numeric
            suffix="%"
            hint="0% vendendo como CPF. Ajuste quando virar MEI/CNPJ."
          />
          <TextField
            label="Margem de lucro padrão"
            registration={register("default_margin_pct")}
            error={e.default_margin_pct}
            numeric
            suffix="%"
            hint="Margem desejada sobre o preço de venda."
          />
          <TextField
            label="Margem mínima aceitável"
            registration={register("min_margin_pct")}
            error={e.min_margin_pct}
            numeric
            suffix="%"
            hint="Abaixo disso, o produto aparece com alerta vermelho."
          />
          <FieldShell label="Arredondamento do preço" error={e.rounding_rule} className="sm:col-span-2">
            {({ id, describedBy, invalid }) => (
              <Controller
                control={control}
                name="rounding_rule"
                render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger id={id} aria-describedby={describedBy} aria-invalid={invalid} className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {ROUNDING_OPTIONS.map(([value, label]) => (
                        <SelectItem key={value} value={value}>
                          {label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
            )}
          </FieldShell>
        </CardContent>
        <CardFooter className="justify-end">
          <SubmitButton pending={isPending}>Salvar custos</SubmitButton>
        </CardFooter>
      </Card>
    </form>
  );
}
