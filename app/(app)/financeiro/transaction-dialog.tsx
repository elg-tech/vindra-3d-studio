"use client";

import { Pencil, Plus } from "lucide-react";
import { useState } from "react";
import { Controller, useWatch } from "react-hook-form";
import { FieldShell, TextField } from "@/components/form/field";
import { SubmitButton } from "@/components/form/submit-button";
import { useActionForm } from "@/components/form/use-action-form";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { EXPENSE_CATEGORIES, INCOME_CATEGORIES, type ManualTransaction } from "@/lib/finance";
import { todayIso } from "@/lib/quotes";
import { cn } from "@/lib/utils";
import { toField } from "@/lib/validation/fields";
import { transactionSchema } from "@/lib/validation/schemas";
import { saveTransaction } from "./actions";

/** "Novo lançamento" ou editar um lançamento manual, em um diálogo. */
export function TransactionDialog({ transaction }: { transaction?: ManualTransaction }) {
  const [open, setOpen] = useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {transaction ? (
          <Button variant="ghost" size="icon" aria-label="Editar lançamento">
            <Pencil aria-hidden />
          </Button>
        ) : (
          <Button>
            <Plus aria-hidden /> Novo lançamento
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-md">
        {open && <TransactionForm transaction={transaction ?? null} onDone={() => setOpen(false)} />}
      </DialogContent>
    </Dialog>
  );
}

function TransactionForm({ transaction, onDone }: { transaction: ManualTransaction | null; onDone: () => void }) {
  const { form, onSubmit, isPending } = useActionForm({
    schema: transactionSchema,
    action: saveTransaction,
    onSuccess: onDone,
    defaultValues: {
      id: transaction?.id,
      kind: transaction?.kind ?? "expense",
      category: transaction?.category ?? "",
      description: transaction?.description ?? "",
      amount: toField(transaction?.amount),
      occurredOn: transaction?.occurredOn ?? todayIso(),
      isFixed: transaction?.isFixed ?? false,
    },
  });
  const { register, control, setValue, formState } = form;
  const e = formState.errors;
  const kind = useWatch({ control, name: "kind" });
  const categories: Record<string, string> = kind === "income" ? INCOME_CATEGORIES : EXPENSE_CATEGORIES;

  const setKind = (next: "income" | "expense") => {
    if (next === kind) return;
    setValue("kind", next);
    setValue("category", next === "income" ? "other_income" : "");
    setValue("isFixed", false);
  };

  return (
    <form onSubmit={onSubmit} noValidate className="grid gap-5">
      <DialogHeader>
        <DialogTitle>{transaction ? "Editar lançamento" : "Novo lançamento"}</DialogTitle>
        <DialogDescription>
          Receitas de pedidos e compras de carretel entram sozinhas. Aqui vão as outras despesas e receitas.
        </DialogDescription>
      </DialogHeader>

      <div role="radiogroup" aria-label="Tipo" className="grid grid-cols-2 gap-1 rounded-lg bg-muted p-1">
        {(["expense", "income"] as const).map((k) => (
          <button
            key={k}
            type="button"
            role="radio"
            aria-checked={kind === k}
            onClick={() => setKind(k)}
            className={cn(
              "rounded-md px-3 py-1.5 text-sm font-medium text-muted-foreground transition-colors",
              kind === k && "bg-background text-foreground shadow-sm",
            )}
          >
            {k === "expense" ? "Despesa" : "Outra receita"}
          </button>
        ))}
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <FieldShell
          label="Categoria"
          error={e.category}
          className="sm:col-span-2"
          hint={kind === "expense" ? "O frete cobrado nos pedidos já sai no DRE; lance aqui só fretes fora deles." : undefined}
        >
          {({ id, describedBy, invalid }) => (
            <Controller
              control={control}
              name="category"
              render={({ field }) => (
                <Select value={field.value} onValueChange={field.onChange}>
                  <SelectTrigger id={id} aria-describedby={describedBy} aria-invalid={invalid} className="w-full">
                    <SelectValue placeholder="Escolha" />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(categories).map(([value, label]) => (
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
        <TextField label="Descrição" registration={register("description")} error={e.description} className="sm:col-span-2" placeholder="Opcional" />
        <TextField label="Valor" registration={register("amount")} error={e.amount} numeric prefix="R$" />
        <TextField label="Data" registration={register("occurredOn")} error={e.occurredOn} type="date" />
        {kind === "expense" && (
          <Controller
            control={control}
            name="isFixed"
            render={({ field }) => (
              <div className="flex items-start justify-between gap-3 sm:col-span-2">
                <div className="grid gap-0.5">
                  <Label htmlFor="tx-fixed">Despesa fixa mensal</Label>
                  <p className="text-xs text-muted-foreground">Entra no ponto de equilíbrio (aluguel, internet, assinaturas).</p>
                </div>
                <Switch id="tx-fixed" checked={field.value} onCheckedChange={field.onChange} />
              </div>
            )}
          />
        )}
      </div>

      <DialogFooter>
        <SubmitButton pending={isPending}>{transaction ? "Salvar" : "Lançar"}</SubmitButton>
      </DialogFooter>
    </form>
  );
}
