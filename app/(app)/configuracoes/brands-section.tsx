"use client";

import { Pencil, Plus, Tag } from "lucide-react";
import { useState } from "react";
import { ConfirmDelete } from "@/components/confirm-delete";
import { EmptyState } from "@/components/empty-state";
import { TextField } from "@/components/form/field";
import { SubmitButton } from "@/components/form/submit-button";
import { useActionForm } from "@/components/form/use-action-form";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { formatNumber } from "@/lib/format";
import type { Tables } from "@/lib/supabase/database.types";
import { toField } from "@/lib/validation/fields";
import { brandSchema } from "@/lib/validation/schemas";
import { deleteBrand, saveBrand } from "./actions";

type Brand = Tables<"filament_brands">;

export function BrandsSection({ brands }: { brands: Brand[] }) {
  const [editing, setEditing] = useState<Brand | "new" | null>(null);

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-4">
        <div className="grid gap-1.5">
          <CardTitle>Marcas de filamento</CardTitle>
          <CardDescription>
            O peso do carretel vazio é descontado no &ldquo;Pesar carretel&rdquo;. Pese um carretel vazio de cada marca
            uma vez.
          </CardDescription>
        </div>
        <Button size="sm" onClick={() => setEditing("new")}>
          <Plus aria-hidden /> Nova
        </Button>
      </CardHeader>
      <CardContent>
        {brands.length === 0 ? (
          <EmptyState icon={Tag} title="Nenhuma marca" description="Cadastre as marcas que você compra." />
        ) : (
          <ul className="divide-y">
            {brands.map((b) => (
              <li key={b.id} className="flex items-center justify-between gap-3 py-2">
                <div>
                  <p className="font-medium">{b.name}</p>
                  <p className="text-sm text-muted-foreground tabular-nums">
                    Carretel vazio:{" "}
                    {b.empty_spool_weight_g === null ? "não informado" : `${formatNumber(b.empty_spool_weight_g)} g`}
                  </p>
                </div>
                <div className="flex">
                  <Button variant="ghost" size="icon" aria-label={`Editar ${b.name}`} onClick={() => setEditing(b)}>
                    <Pencil aria-hidden />
                  </Button>
                  <ConfirmDelete
                    iconOnly
                    title={`Excluir a marca ${b.name}?`}
                    description="Os carretéis desta marca continuam cadastrados, mas ficam sem marca."
                    onConfirm={() => deleteBrand(b.id)}
                  />
                </div>
              </li>
            ))}
          </ul>
        )}
      </CardContent>

      <Dialog open={editing !== null} onOpenChange={(open) => !open && setEditing(null)}>
        <DialogContent className="sm:max-w-md">
          {editing !== null && (
            <BrandForm
              key={editing === "new" ? "new" : editing.id}
              brand={editing === "new" ? null : editing}
              onDone={() => setEditing(null)}
            />
          )}
        </DialogContent>
      </Dialog>
    </Card>
  );
}

export function BrandForm({ brand, onDone }: { brand: Brand | null; onDone: () => void }) {
  const { form, onSubmit, isPending } = useActionForm({
    schema: brandSchema,
    action: saveBrand,
    onSuccess: onDone,
    defaultValues: {
      id: brand?.id,
      name: brand?.name ?? "",
      empty_spool_weight_g: toField(brand?.empty_spool_weight_g),
    },
  });
  const e = form.formState.errors;

  return (
    <form onSubmit={onSubmit} noValidate className="grid gap-5">
      <DialogHeader>
        <DialogTitle>{brand ? "Editar marca" : "Nova marca"}</DialogTitle>
        <DialogDescription>Ex.: Bambu Lab, Voolt3D, 3D Fila, Sunlu.</DialogDescription>
      </DialogHeader>
      <TextField label="Nome" registration={form.register("name")} error={e.name} />
      <TextField
        label="Peso do carretel vazio"
        registration={form.register("empty_spool_weight_g")}
        error={e.empty_spool_weight_g}
        numeric
        suffix="g"
        hint="Pese na balança um carretel vazio desta marca."
      />
      <DialogFooter>
        <SubmitButton pending={isPending}>{brand ? "Salvar" : "Cadastrar"}</SubmitButton>
      </DialogFooter>
    </form>
  );
}
