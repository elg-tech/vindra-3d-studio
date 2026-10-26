"use client";

import { Package2, Pencil, Plus } from "lucide-react";
import { useState } from "react";
import { Controller } from "react-hook-form";
import { ConfirmDelete } from "@/components/confirm-delete";
import { EmptyState } from "@/components/empty-state";
import { TextAreaField, TextField } from "@/components/form/field";
import { SubmitButton } from "@/components/form/submit-button";
import { useActionForm } from "@/components/form/use-action-form";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { formatNumber, formatUnitCost } from "@/lib/format";
import type { Tables } from "@/lib/supabase/database.types";
import { toField } from "@/lib/validation/fields";
import { supplySchema } from "@/lib/validation/schemas";
import { deleteSupply, saveSupply } from "./actions";

type Supply = Tables<"supplies">;

export function SuppliesList({ supplies }: { supplies: Supply[] }) {
  const [editing, setEditing] = useState<Supply | "new" | null>(null);

  return (
    <div className="grid gap-4">
      <div className="flex justify-end">
        <Button onClick={() => setEditing("new")}>
          <Plus aria-hidden /> Novo insumo
        </Button>
      </div>

      {supplies.length === 0 ? (
        <EmptyState
          icon={Package2}
          title="Nenhum insumo cadastrado"
          description="Cadastre embalagens e peças extras para somar no custo das peças com um clique."
        />
      ) : (
        <Card className="py-0">
          <CardContent className="px-0">
            <ul className="divide-y">
              {supplies.map((s) => (
                <li key={s.id} className="flex items-center gap-3 px-4 py-3">
                  <div className="min-w-0 flex-1">
                    <p className="flex flex-wrap items-center gap-2 font-medium">
                      {s.name}
                      {s.is_packaging && <Badge variant="outline">Embalagem</Badge>}
                    </p>
                    <p className="text-sm text-muted-foreground tabular-nums">
                      {formatUnitCost(s.unit_cost)} / {s.unit}
                      {s.stock_qty !== null && ` · estoque ${formatNumber(s.stock_qty)} ${s.unit}`}
                    </p>
                  </div>
                  <Button variant="ghost" size="icon" aria-label={`Editar ${s.name}`} onClick={() => setEditing(s)}>
                    <Pencil aria-hidden />
                  </Button>
                  <ConfirmDelete
                    iconOnly
                    title={`Excluir ${s.name}?`}
                    description="Fichas de custo que usam este insumo mantêm o valor que já tinham."
                    onConfirm={() => deleteSupply(s.id)}
                  />
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      <Dialog open={editing !== null} onOpenChange={(open) => !open && setEditing(null)}>
        <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-md">
          {editing !== null && (
            <SupplyForm
              key={editing === "new" ? "new" : editing.id}
              supply={editing === "new" ? null : editing}
              onDone={() => setEditing(null)}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function SupplyForm({ supply, onDone }: { supply: Supply | null; onDone: () => void }) {
  const { form, onSubmit, isPending } = useActionForm({
    schema: supplySchema,
    action: saveSupply,
    onSuccess: onDone,
    defaultValues: {
      id: supply?.id,
      name: supply?.name ?? "",
      unit: supply?.unit ?? "un",
      unit_cost: toField(supply?.unit_cost),
      is_packaging: supply?.is_packaging ?? false,
      stock_qty: toField(supply?.stock_qty),
      notes: supply?.notes ?? "",
    },
  });
  const { register, control, formState } = form;
  const e = formState.errors;

  return (
    <form onSubmit={onSubmit} noValidate className="grid gap-5">
      <DialogHeader>
        <DialogTitle>{supply ? "Editar insumo" : "Novo insumo"}</DialogTitle>
        <DialogDescription>Informe o custo de uma unidade (ex.: pacote de 100 argolas a R$ 15 → R$ 0,15).</DialogDescription>
      </DialogHeader>
      <TextField label="Nome" registration={register("name")} error={e.name} placeholder="Argola para chaveiro" />
      <div className="grid grid-cols-2 gap-4">
        <TextField label="Custo unitário" registration={register("unit_cost")} error={e.unit_cost} numeric prefix="R$" />
        <TextField label="Unidade" registration={register("unit")} error={e.unit} placeholder="un, g, ml, cm" />
      </div>
      <TextField
        label="Estoque (opcional)"
        registration={register("stock_qty")}
        error={e.stock_qty}
        numeric
        hint="Apenas informativo por enquanto."
      />
      <Controller
        control={control}
        name="is_packaging"
        render={({ field }) => (
          <div className="flex items-center justify-between gap-3">
            <Label htmlFor="supply-packaging">É embalagem</Label>
            <Switch id="supply-packaging" checked={field.value} onCheckedChange={field.onChange} />
          </div>
        )}
      />
      <TextAreaField label="Observações" registration={register("notes")} error={e.notes} rows={2} />
      <DialogFooter>
        <SubmitButton pending={isPending}>{supply ? "Salvar" : "Cadastrar"}</SubmitButton>
      </DialogFooter>
    </form>
  );
}
