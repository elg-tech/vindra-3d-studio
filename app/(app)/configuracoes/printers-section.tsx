"use client";

import { Pencil, Plus, Printer } from "lucide-react";
import { useState } from "react";
import { Controller } from "react-hook-form";
import { ConfirmDelete } from "@/components/confirm-delete";
import { EmptyState } from "@/components/empty-state";
import { TextField } from "@/components/form/field";
import { SubmitButton } from "@/components/form/submit-button";
import { UnusualValuesDialog } from "@/components/form/unusual-values-dialog";
import { useActionForm } from "@/components/form/use-action-form";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { formatCurrency } from "@/lib/format";
import { parseDecimal } from "@/lib/numbers";
import { depreciationPerHour, energyCostPerHour } from "@/lib/pricing";
import type { Tables } from "@/lib/supabase/database.types";
import { unusualValues } from "@/lib/unusual-values";
import { toField } from "@/lib/validation/fields";
import { printerSchema } from "@/lib/validation/schemas";
import { deletePrinter, savePrinter } from "./actions";

type PrinterRow = Tables<"printers">;

/** Custo da máquina por hora; null nos itens ainda não preenchidos. */
function hourlyCosts(
  price: number | null,
  lifetime: number | null,
  watts: number | null,
  maintenance: number | null,
  energyRate: number | null,
) {
  const depreciation = price !== null && lifetime ? depreciationPerHour(price, lifetime) : null;
  const energy = watts !== null && energyRate !== null ? energyCostPerHour(watts, energyRate) : null;
  const parts = [depreciation, energy, maintenance];
  const total = parts.every((p) => p !== null) ? parts.reduce<number>((s, p) => s + (p ?? 0), 0) : null;
  return { depreciation, energy, maintenance, total };
}

const money = (v: number | null) => (v === null ? "—" : formatCurrency(v));

export function PrintersSection({ printers, energyRate }: { printers: PrinterRow[]; energyRate: number | null }) {
  const [editing, setEditing] = useState<PrinterRow | "new" | null>(null);

  return (
    <div className="grid gap-4">
      <div className="flex justify-end">
        <Button onClick={() => setEditing("new")}>
          <Plus aria-hidden /> Nova impressora
        </Button>
      </div>

      {printers.length === 0 ? (
        <EmptyState icon={Printer} title="Nenhuma impressora" description="Cadastre sua impressora para calcular depreciação e energia." />
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {printers.map((p) => {
            const c = hourlyCosts(p.purchase_price, p.lifetime_hours, p.power_watts, p.maintenance_per_hour, energyRate);
            return (
              <Card key={p.id} className={p.active ? undefined : "opacity-60"}>
                <CardHeader>
                  <CardTitle className="flex items-center justify-between gap-2">
                    <span className="flex items-center gap-2">
                      {p.name}
                      {p.is_default && <Badge>Padrão</Badge>}
                      {!p.active && <Badge variant="outline">Inativa</Badge>}
                    </span>
                    <span className="flex">
                      <Button variant="ghost" size="icon" aria-label={`Editar ${p.name}`} onClick={() => setEditing(p)}>
                        <Pencil aria-hidden />
                      </Button>
                      <ConfirmDelete
                        iconOnly
                        title={`Excluir ${p.name}?`}
                        description="Fichas de custo que usam esta impressora ficarão sem impressora definida."
                        onConfirm={() => deletePrinter(p.id)}
                      />
                    </span>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                    <dt className="text-muted-foreground">Depreciação</dt>
                    <dd className="text-right tabular-nums">{money(c.depreciation)}/h</dd>
                    <dt className="text-muted-foreground">Energia</dt>
                    <dd className="text-right tabular-nums">{money(c.energy)}/h</dd>
                    <dt className="text-muted-foreground">Manutenção</dt>
                    <dd className="text-right tabular-nums">{money(c.maintenance)}/h</dd>
                    <dt className="border-t pt-2 font-medium">Custo da máquina</dt>
                    <dd className="border-t pt-2 text-right font-semibold tabular-nums">{money(c.total)}/h</dd>
                  </dl>
                  {c.total === null && (
                    <p className="mt-3 text-xs text-warning">
                      Preencha valor, vida útil, consumo e manutenção
                      {energyRate === null && " (e a tarifa de energia na aba Custos)"} para o cálculo completo.
                    </p>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <Dialog open={editing !== null} onOpenChange={(open) => !open && setEditing(null)}>
        <DialogContent className="sm:max-w-lg">
          {editing !== null && (
            <PrinterForm
              key={editing === "new" ? "new" : editing.id}
              printer={editing === "new" ? null : editing}
              energyRate={energyRate}
              onDone={() => setEditing(null)}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function PrinterForm({
  printer,
  energyRate,
  onDone,
}: {
  printer: PrinterRow | null;
  energyRate: number | null;
  onDone: () => void;
}) {
  const { form, onSubmit, isPending, confirmation } = useActionForm({
    schema: printerSchema,
    action: savePrinter,
    checkUnusual: (v) => unusualValues({ power_watts: v.power_watts }),
    onSuccess: onDone,
    defaultValues: {
      id: printer?.id,
      name: printer?.name ?? "",
      model: printer?.model ?? "",
      purchase_price: toField(printer?.purchase_price),
      lifetime_hours: toField(printer?.lifetime_hours),
      power_watts: toField(printer?.power_watts),
      maintenance_per_hour: toField(printer?.maintenance_per_hour),
      is_default: printer?.is_default ?? false,
      active: printer?.active ?? true,
    },
  });
  const { register, control, formState, watch } = form;
  const e = formState.errors;
  const [price, lifetime, watts, maintenance] = watch([
    "purchase_price",
    "lifetime_hours",
    "power_watts",
    "maintenance_per_hour",
  ]);
  const lifetimeN = parseDecimal(lifetime);
  const preview = hourlyCosts(
    parseDecimal(price),
    lifetimeN && lifetimeN > 0 ? lifetimeN : null,
    parseDecimal(watts),
    parseDecimal(maintenance),
    energyRate,
  );

  return (
    <form onSubmit={onSubmit} noValidate className="grid gap-5">
      <UnusualValuesDialog {...confirmation} />
      <DialogHeader>
        <DialogTitle>{printer ? "Editar impressora" : "Nova impressora"}</DialogTitle>
        <DialogDescription>Esses valores definem o custo da máquina por hora de impressão.</DialogDescription>
      </DialogHeader>

      <div className="grid gap-4 sm:grid-cols-2">
        <TextField label="Nome" registration={register("name")} error={e.name} placeholder="Bambu Lab A1" />
        <TextField label="Modelo" registration={register("model")} error={e.model} placeholder="A1" />
        <TextField
          label="Valor pago"
          registration={register("purchase_price")}
          error={e.purchase_price}
          numeric
          prefix="R$"
          hint="Inclua frete e acessórios essenciais."
        />
        <TextField
          label="Vida útil estimada"
          registration={register("lifetime_hours")}
          error={e.lifetime_hours}
          numeric
          suffix="h"
          hint="Horas de impressão até precisar trocar a máquina."
        />
        <TextField
          label="Consumo médio"
          registration={register("power_watts")}
          error={e.power_watts}
          numeric
          suffix="W"
          hint="Meça com uma tomada medidora durante uma impressão típica."
        />
        <TextField
          label="Manutenção"
          registration={register("maintenance_per_hour")}
          error={e.maintenance_per_hour}
          numeric
          prefix="R$"
          suffix="/h"
          hint="Bico, mesa, correias… ÷ horas que duram."
        />
      </div>

      <div className="grid gap-3 rounded-lg border p-3">
        <Controller
          control={control}
          name="is_default"
          render={({ field }) => (
            <div className="flex items-center justify-between gap-3">
              <Label htmlFor="printer-default">Impressora padrão da calculadora</Label>
              <Switch id="printer-default" checked={field.value} onCheckedChange={field.onChange} />
            </div>
          )}
        />
        <Controller
          control={control}
          name="active"
          render={({ field }) => (
            <div className="flex items-center justify-between gap-3">
              <Label htmlFor="printer-active">Ativa</Label>
              <Switch id="printer-active" checked={field.value} onCheckedChange={field.onChange} />
            </div>
          )}
        />
      </div>

      <p className="rounded-lg bg-muted px-3 py-2 text-sm">
        Custo da máquina:{" "}
        <strong className="tabular-nums">{money(preview.total)}/h</strong>
        {preview.total === null && <span className="text-muted-foreground"> (preencha todos os campos)</span>}
      </p>

      <DialogFooter>
        <SubmitButton pending={isPending}>{printer ? "Salvar" : "Cadastrar"}</SubmitButton>
      </DialogFooter>
    </form>
  );
}
