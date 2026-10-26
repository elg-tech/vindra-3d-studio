"use client";

import { useRouter } from "next/navigation";
import { Controller } from "react-hook-form";
import { ColorDot } from "@/components/color-dot";
import { FieldShell, TextAreaField, TextField } from "@/components/form/field";
import { SubmitButton } from "@/components/form/submit-button";
import { UnusualValuesDialog } from "@/components/form/unusual-values-dialog";
import { useActionForm } from "@/components/form/use-action-form";
import { DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { MATERIALS, type Material, costPerGram } from "@/lib/filaments";
import { formatUnitCost } from "@/lib/format";
import { parseDecimal } from "@/lib/numbers";
import type { Tables } from "@/lib/supabase/database.types";
import { unusualValues } from "@/lib/unusual-values";
import { toField } from "@/lib/validation/fields";
import { filamentSchema } from "@/lib/validation/schemas";
import { saveFilament } from "./actions";

const NO_BRAND = "none";

export function FilamentForm({
  filament,
  brands,
  onDone,
}: {
  filament: Tables<"filaments"> | null;
  brands: Pick<Tables<"filament_brands">, "id" | "name">[];
  onDone: () => void;
}) {
  const router = useRouter();
  const { form, onSubmit, isPending, confirmation } = useActionForm({
    schema: filamentSchema,
    action: saveFilament,
    checkUnusual: (v) => unusualValues({ price_paid: v.price_paid, net_weight_g: v.net_weight_g }),
    onSuccess: (data) => {
      onDone();
      // carretel novo: abre a página dele
      if (!filament && data?.id) router.push(`/filamentos/${data.id}`);
    },
    defaultValues: {
      id: filament?.id,
      brand_id: filament?.brand_id ?? "",
      material: (filament?.material as Material | undefined) ?? "PLA",
      color_name: filament?.color_name ?? "",
      color_hex: filament?.color_hex ?? "#111111",
      diameter_mm: toField(filament?.diameter_mm ?? 1.75),
      price_paid: toField(filament?.price_paid),
      shipping_cost: toField(filament?.shipping_cost ?? 0),
      net_weight_g: toField(filament?.net_weight_g ?? 1000),
      min_stock_g: toField(filament?.min_stock_g ?? 100),
      purchased_at: filament?.purchased_at ?? "",
      supplier: filament?.supplier ?? "",
      notes: filament?.notes ?? "",
    },
  });
  const { register, control, formState, watch, setValue } = form;
  const e = formState.errors;

  const [price, shipping, weight, hex] = watch(["price_paid", "shipping_cost", "net_weight_g", "color_hex"]);
  const p = parseDecimal(price);
  const w = parseDecimal(weight);
  const preview = p !== null && w !== null && w > 0 ? costPerGram(p, parseDecimal(shipping) ?? 0, w) : null;

  return (
    <form onSubmit={onSubmit} noValidate className="grid gap-5">
      <UnusualValuesDialog {...confirmation} />
      <DialogHeader>
        <DialogTitle>{filament ? "Editar carretel" : "Novo carretel"}</DialogTitle>
        <DialogDescription>
          {filament
            ? "Alterar o peso líquido corrige a entrada no estoque."
            : "O peso líquido entra no estoque automaticamente."}
        </DialogDescription>
      </DialogHeader>

      <div className="grid gap-4 sm:grid-cols-2">
        <FieldShell label="Material" error={e.material}>
          {({ id, describedBy, invalid }) => (
            <Controller
              control={control}
              name="material"
              render={({ field }) => (
                <Select value={field.value} onValueChange={field.onChange}>
                  <SelectTrigger id={id} aria-describedby={describedBy} aria-invalid={invalid} className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {MATERIALS.map((m) => (
                      <SelectItem key={m} value={m}>
                        {m}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
          )}
        </FieldShell>

        <FieldShell label="Marca" error={e.brand_id} hint="Cadastre marcas em Configurações → Marcas.">
          {({ id, describedBy, invalid }) => (
            <Controller
              control={control}
              name="brand_id"
              render={({ field }) => (
                <Select
                  value={field.value === "" ? NO_BRAND : field.value}
                  onValueChange={(v) => field.onChange(v === NO_BRAND ? "" : v)}
                >
                  <SelectTrigger id={id} aria-describedby={describedBy} aria-invalid={invalid} className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NO_BRAND}>Sem marca</SelectItem>
                    {brands.map((b) => (
                      <SelectItem key={b.id} value={b.id}>
                        {b.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
          )}
        </FieldShell>

        <TextField label="Nome da cor" registration={register("color_name")} error={e.color_name} placeholder="Preto" />

        <FieldShell label="Cor" error={e.color_hex}>
          {({ id, describedBy, invalid }) => (
            <div className="flex items-center gap-2">
              <ColorDot hex={/^#[0-9a-f]{6}$/i.test(hex) ? hex : "#888888"} className="size-8" />
              <input
                type="color"
                aria-label="Escolher cor"
                value={/^#[0-9a-f]{6}$/i.test(hex) ? hex : "#888888"}
                onChange={(ev) => setValue("color_hex", ev.target.value, { shouldValidate: true })}
                className="h-9 w-12 cursor-pointer rounded-md border bg-transparent"
              />
              <Input
                id={id}
                aria-describedby={describedBy}
                aria-invalid={invalid}
                className="font-mono uppercase"
                maxLength={7}
                {...register("color_hex")}
              />
            </div>
          )}
        </FieldShell>

        <TextField label="Preço pago" registration={register("price_paid")} error={e.price_paid} numeric prefix="R$" />
        <TextField
          label="Frete rateado"
          registration={register("shipping_cost")}
          error={e.shipping_cost}
          numeric
          prefix="R$"
          hint="Parte do frete que cabe a este carretel."
        />
        <TextField
          label="Peso líquido"
          registration={register("net_weight_g")}
          error={e.net_weight_g}
          numeric
          suffix="g"
          hint="Só o filamento, sem o carretel."
        />
        <TextField
          label="Estoque mínimo"
          registration={register("min_stock_g")}
          error={e.min_stock_g}
          numeric
          suffix="g"
          hint="Abaixo disso, aparece alerta."
        />
        <TextField label="Diâmetro" registration={register("diameter_mm")} error={e.diameter_mm} numeric suffix="mm" />
        <TextField label="Data da compra" registration={register("purchased_at")} error={e.purchased_at} type="date" />
        <TextField
          label="Fornecedor"
          registration={register("supplier")}
          error={e.supplier}
          placeholder="Loja, site…"
          className="sm:col-span-2"
        />
        <TextAreaField label="Observações" registration={register("notes")} error={e.notes} rows={2} className="sm:col-span-2" />
      </div>

      <p className="rounded-lg bg-muted px-3 py-2 text-sm">
        Custo por grama:{" "}
        <strong className="tabular-nums">{preview === null ? "—" : `${formatUnitCost(preview)}/g`}</strong>
      </p>

      <DialogFooter>
        <SubmitButton pending={isPending}>{filament ? "Salvar" : "Cadastrar carretel"}</SubmitButton>
      </DialogFooter>
    </form>
  );
}
