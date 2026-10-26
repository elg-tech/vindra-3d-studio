"use client";

import { AlertOctagon, Scale, SlidersHorizontal } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Controller } from "react-hook-form";
import { toast } from "sonner";
import { ConfirmDelete } from "@/components/confirm-delete";
import { TextField } from "@/components/form/field";
import { SubmitButton } from "@/components/form/submit-button";
import { useActionForm } from "@/components/form/use-action-form";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { FILAMENT_STATUS, FILAMENT_STATUS_LABEL, type FilamentStatus, weighSpool } from "@/lib/filaments";
import { formatGrams } from "@/lib/format";
import { parseDecimal } from "@/lib/numbers";
import { toField } from "@/lib/validation/fields";
import { movementSchema, weighSchema } from "@/lib/validation/schemas";
import { addMovement, deleteFilament, setFilamentStatus, weighFilament } from "../actions";

type Props = {
  id: string;
  status: FilamentStatus;
  remainingG: number;
  brandName: string | null;
  brandEmptySpoolG: number | null;
};

export function FilamentActions(props: Props) {
  const router = useRouter();
  const [dialog, setDialog] = useState<"weigh" | "adjustment" | "failure" | null>(null);
  const [isPending, startTransition] = useTransition();
  const close = () => setDialog(null);

  const changeStatus = (status: string) =>
    startTransition(async () => {
      const result = await setFilamentStatus({ id: props.id, status });
      if (result.ok) toast.success(result.message);
      else toast.error(result.error);
    });

  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap gap-2">
        <Button onClick={() => setDialog("weigh")}>
          <Scale aria-hidden /> Pesar carretel
        </Button>
        <Button variant="outline" onClick={() => setDialog("adjustment")}>
          <SlidersHorizontal aria-hidden /> Ajuste
        </Button>
        <Button variant="outline" onClick={() => setDialog("failure")}>
          <AlertOctagon aria-hidden /> Falha de impressão
        </Button>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Label htmlFor="filament-status" className="text-muted-foreground">
            Status
          </Label>
          <Select value={props.status} onValueChange={changeStatus} disabled={isPending}>
            <SelectTrigger id="filament-status" size="sm" className="w-32">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {FILAMENT_STATUS.map((s) => (
                <SelectItem key={s} value={s}>
                  {FILAMENT_STATUS_LABEL[s]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <ConfirmDelete
          label="Excluir carretel"
          title="Excluir este carretel?"
          description="O histórico de movimentações também será apagado. Fichas de custo que usam este carretel passam a usar o custo médio do material. Se ele só acabou, prefira marcar como “Acabou”."
          onConfirm={() => deleteFilament(props.id)}
          onDone={() => router.push("/filamentos")}
        />
      </div>

      <Dialog open={dialog !== null} onOpenChange={(open) => !open && close()}>
        <DialogContent className="sm:max-w-md">
          {dialog === "weigh" && <WeighForm {...props} onDone={close} />}
          {(dialog === "adjustment" || dialog === "failure") && (
            <MovementForm id={props.id} kind={dialog} remainingG={props.remainingG} onDone={close} />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function WeighForm({ id, remainingG, brandName, brandEmptySpoolG, onDone }: Props & { onDone: () => void }) {
  const { form, onSubmit, isPending } = useActionForm({
    schema: weighSchema,
    action: weighFilament,
    onSuccess: onDone,
    defaultValues: {
      id,
      scale_weight_g: "",
      empty_spool_weight_g: toField(brandEmptySpoolG),
      save_as_brand_default: brandEmptySpoolG === null && brandName !== null,
    },
  });
  const { register, control, formState, watch } = form;
  const e = formState.errors;
  const [scale, empty] = watch(["scale_weight_g", "empty_spool_weight_g"]);
  const scaleN = parseDecimal(scale);
  const emptyN = parseDecimal(empty);
  const preview = scaleN !== null && emptyN !== null ? weighSpool(scaleN, emptyN, remainingG) : null;

  return (
    <form onSubmit={onSubmit} noValidate className="grid gap-5">
      <DialogHeader>
        <DialogTitle>Pesar carretel</DialogTitle>
        <DialogDescription>
          Coloque o carretel na balança. O sistema desconta o carretel vazio e corrige o saldo.
        </DialogDescription>
      </DialogHeader>
      <TextField
        label="Peso na balança"
        registration={register("scale_weight_g")}
        error={e.scale_weight_g}
        numeric
        suffix="g"
        autoFocus
      />
      <TextField
        label="Peso do carretel vazio"
        registration={register("empty_spool_weight_g")}
        error={e.empty_spool_weight_g}
        numeric
        suffix="g"
        hint={
          brandEmptySpoolG === null
            ? "Ainda não informado para esta marca. Pese um carretel vazio uma vez."
            : `Padrão da marca ${brandName}.`
        }
      />
      {brandName && (
        <Controller
          control={control}
          name="save_as_brand_default"
          render={({ field }) => (
            <div className="flex items-center justify-between gap-3">
              <Label htmlFor="save-brand-default">Salvar como padrão da marca {brandName}</Label>
              <Switch id="save-brand-default" checked={field.value} onCheckedChange={field.onChange} />
            </div>
          )}
        />
      )}
      <div className="rounded-lg bg-muted px-3 py-2 text-sm tabular-nums">
        {preview ? (
          <>
            Restante: <strong>{formatGrams(preview.remainingG)}</strong>{" "}
            <span className="text-muted-foreground">
              (saldo atual {formatGrams(remainingG)}
              {preview.adjustmentG !== 0 &&
                `, ajuste de ${preview.adjustmentG > 0 ? "+" : ""}${formatGrams(preview.adjustmentG)}`}
              )
            </span>
          </>
        ) : (
          <span className="text-muted-foreground">Saldo atual: {formatGrams(remainingG)}</span>
        )}
      </div>
      <DialogFooter>
        <SubmitButton pending={isPending}>Corrigir saldo</SubmitButton>
      </DialogFooter>
    </form>
  );
}

function MovementForm({
  id,
  kind,
  remainingG,
  onDone,
}: {
  id: string;
  kind: "adjustment" | "failure";
  remainingG: number;
  onDone: () => void;
}) {
  const { form, onSubmit, isPending } = useActionForm({
    schema: movementSchema,
    action: addMovement,
    onSuccess: onDone,
    defaultValues: { id, kind, grams: "", notes: "" },
  });
  const e = form.formState.errors;
  const isFailure = kind === "failure";

  return (
    <form onSubmit={onSubmit} noValidate className="grid gap-5">
      <DialogHeader>
        <DialogTitle>{isFailure ? "Registrar falha de impressão" : "Ajuste manual"}</DialogTitle>
        <DialogDescription>
          {isFailure
            ? "Os gramas perdidos saem do estoque. (Na Fase 8, falhas ligadas a pedidos também entram no custo do pedido.)"
            : "Use número negativo para descontar (ex.: -30) e positivo para somar."}
        </DialogDescription>
      </DialogHeader>
      <TextField
        label={isFailure ? "Gramas perdidos" : "Gramas"}
        registration={form.register("grams")}
        error={e.grams}
        numeric
        suffix="g"
        autoFocus
        hint={`Saldo atual: ${formatGrams(remainingG)}`}
      />
      <TextField
        label="Observação"
        registration={form.register("notes")}
        error={e.notes}
        placeholder={isFailure ? "Ex.: descolou da mesa na camada 12" : "Ex.: sobra usada em teste"}
      />
      <DialogFooter>
        <SubmitButton pending={isPending}>{isFailure ? "Registrar falha" : "Lançar ajuste"}</SubmitButton>
      </DialogFooter>
    </form>
  );
}
