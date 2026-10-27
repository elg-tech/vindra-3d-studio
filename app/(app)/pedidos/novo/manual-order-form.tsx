"use client";

import { Plus, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { Controller, useFieldArray, useWatch } from "react-hook-form";
import { FieldShell, TextAreaField, TextField } from "@/components/form/field";
import { SubmitButton } from "@/components/form/submit-button";
import { useActionForm } from "@/components/form/use-action-form";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from "@/components/ui/select";
import { formatCurrency } from "@/lib/format";
import { parseDecimal } from "@/lib/numbers";
import { profitAtPrice } from "@/lib/pricing";
import { type ManualOrderInput, manualOrderSchema } from "@/lib/validation/schemas";
import { createManualOrder } from "../actions";
import type { OrderCatalogOption, OrderChannel } from "./load";

const NONE = "none";
const ADD = "add";
const num = (v: string | undefined) => parseDecimal(v ?? "") ?? 0;
const priceText = (n: number | null | undefined) => (n === null || n === undefined ? "" : n.toFixed(2).replace(".", ","));
const isPlatform = (c: OrderChannel | undefined) => c?.kind === "shopee" || c?.kind === "tiktok";

export function ManualOrderForm({
  channels,
  customers,
  options,
}: {
  channels: OrderChannel[];
  customers: { id: string; name: string }[];
  options: OrderCatalogOption[];
}) {
  const router = useRouter();
  const { form, onSubmit, isPending } = useActionForm({
    schema: manualOrderSchema,
    action: createManualOrder,
    onSuccess: (data) => data?.id && router.push(`/pedidos/${data.id}`),
    defaultValues: {
      channelId: channels.find((c) => isPlatform(c))?.id ?? channels[0]?.id ?? "",
      platformOrderNumber: "",
      customerId: "",
      dueDate: "",
      shippingCost: "0",
      notes: "",
      items: [],
    } satisfies ManualOrderInput,
  });
  const { control, register, formState } = form;
  const e = formState.errors;
  const items = useFieldArray({ control, name: "items" });
  const values = useWatch({ control }) as ManualOrderInput;
  const channel = channels.find((c) => c.id === values.channelId);

  const subtotal = (values.items ?? []).reduce((s, i) => s + num(i.quantity) * num(i.unitPrice), 0);
  const total = subtotal + num(values.shippingCost);
  const fees = channel
    ? profitAtPrice(total, 0, { commissionPct: channel.commissionPct, extraPct: channel.extraPct, fixedFee: channel.fixedFee }, 0).channelFees
    : 0;

  function add(value: string) {
    const option = options.find((o) => `${o.kind}:${o.id}` === value);
    if (!option) return;
    items.append({
      variantId: option.kind === "variant" ? option.id : "",
      costSheetId: option.kind === "sheet" ? option.id : "",
      description: option.label,
      quantity: "1",
      unitPrice: priceText(option.prices[values.channelId ?? ""]),
    });
  }

  return (
    <form onSubmit={onSubmit} noValidate className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,20rem)] lg:items-start">
      <div className="grid min-w-0 gap-4">
        <Card>
          <CardHeader>
            <CardTitle>Venda</CardTitle>
            <CardDescription>
              {isPlatform(channel)
                ? "Shopee e TikTok entram na fila já pagos pela plataforma."
                : "Venda direta entra em “Aguardando pagamento”."}
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <FieldShell label="Canal" error={e.channelId}>
              {({ id, describedBy, invalid }) => (
                <Controller
                  control={control}
                  name="channelId"
                  render={({ field }) => (
                    <Select value={field.value || undefined} onValueChange={field.onChange}>
                      <SelectTrigger id={id} aria-describedby={describedBy} aria-invalid={invalid} className="w-full">
                        <SelectValue placeholder="Escolha o canal" />
                      </SelectTrigger>
                      <SelectContent>
                        {channels.map((c) => (
                          <SelectItem key={c.id} value={c.id}>
                            {c.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                />
              )}
            </FieldShell>
            <TextField
              label="Número do pedido na plataforma"
              registration={register("platformOrderNumber")}
              error={e.platformOrderNumber}
              placeholder={isPlatform(channel) ? "ex.: 2410270ABC123" : "opcional"}
            />
            <FieldShell label="Cliente" error={e.customerId}>
              {({ id }) => (
                <Controller
                  control={control}
                  name="customerId"
                  render={({ field }) => (
                    <Select value={field.value || NONE} onValueChange={(v) => field.onChange(v === NONE ? "" : v)}>
                      <SelectTrigger id={id} className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={NONE}>Sem cliente</SelectItem>
                        {customers.map((c) => (
                          <SelectItem key={c.id} value={c.id}>
                            {c.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                />
              )}
            </FieldShell>
            <TextField label="Prazo de envio" registration={register("dueDate")} error={e.dueDate} type="date" />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Itens</CardTitle>
            <CardDescription>Preço do canal escolhido; edite à vontade.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3">
            {e.items?.root?.message && (
              <p role="alert" className="text-sm text-destructive">
                {e.items.root.message}
              </p>
            )}
            {items.fields.map((f, i) => (
              <div key={f.id} className="grid gap-2 rounded-lg border p-3">
                <div className="flex items-start gap-2">
                  <TextField
                    label={`Item ${i + 1}`}
                    registration={register(`items.${i}.description`)}
                    error={e.items?.[i]?.description}
                    className="min-w-0 flex-1"
                  />
                  <Button type="button" variant="ghost" size="icon" className="mt-6" onClick={() => items.remove(i)} aria-label={`Remover item ${i + 1}`}>
                    <Trash2 aria-hidden />
                  </Button>
                </div>
                <div className="grid grid-cols-[5rem_minmax(0,1fr)] gap-2 sm:grid-cols-[5rem_10rem]">
                  <TextField label="Qtd." registration={register(`items.${i}.quantity`)} error={e.items?.[i]?.quantity} numeric inputMode="numeric" />
                  <TextField label="Preço unitário" registration={register(`items.${i}.unitPrice`)} error={e.items?.[i]?.unitPrice} numeric prefix="R$" />
                </div>
              </div>
            ))}
            <div className="flex flex-wrap gap-2">
              {options.length > 0 && (
                <Select value={ADD} onValueChange={add}>
                  <SelectTrigger className="w-full sm:w-72" aria-label="Adicionar do catálogo ou de uma ficha">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={ADD} disabled className="hidden">
                      <Plus aria-hidden /> Adicionar do catálogo…
                    </SelectItem>
                    {(["variant", "sheet"] as const).map((kind) => {
                      const group = options.filter((o) => o.kind === kind);
                      if (group.length === 0) return null;
                      return (
                        <SelectGroup key={kind}>
                          <SelectLabel>{kind === "variant" ? "Produtos" : "Fichas da calculadora"}</SelectLabel>
                          {group.map((o) => (
                            <SelectItem key={o.id} value={`${o.kind}:${o.id}`}>
                              {o.label}
                              {o.prices[values.channelId ?? ""] != null && (
                                <span className="text-muted-foreground"> · {formatCurrency(o.prices[values.channelId ?? ""]!)}</span>
                              )}
                            </SelectItem>
                          ))}
                        </SelectGroup>
                      );
                    })}
                  </SelectContent>
                </Select>
              )}
              <Button
                type="button"
                variant="outline"
                onClick={() => items.append({ variantId: "", costSheetId: "", description: "", quantity: "1", unitPrice: "" })}
              >
                <Plus aria-hidden /> Item avulso
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <TextField label="Frete" registration={register("shippingCost")} error={e.shippingCost} numeric prefix="R$" />
            <TextAreaField label="Observações" registration={register("notes")} error={e.notes} rows={2} className="sm:col-span-2" />
          </CardContent>
        </Card>
      </div>

      <Card className="lg:sticky lg:top-20">
        <CardHeader>
          <CardTitle>Resumo</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4">
          <dl className="grid grid-cols-[1fr_auto] gap-y-1 text-sm">
            <dt className="text-muted-foreground">Itens</dt>
            <dd className="text-right tabular-nums">{formatCurrency(subtotal)}</dd>
            <dt className="text-muted-foreground">Frete</dt>
            <dd className="text-right tabular-nums">{formatCurrency(num(values.shippingCost))}</dd>
            <dt className="border-t pt-1 font-medium">Total</dt>
            <dd className="border-t pt-1 text-right text-xl font-semibold tabular-nums">{formatCurrency(total)}</dd>
            <dt className="text-muted-foreground">Taxas do canal</dt>
            <dd className="text-right tabular-nums">−{formatCurrency(fees)}</dd>
          </dl>
          <SubmitButton pending={isPending}>Criar pedido</SubmitButton>
        </CardContent>
      </Card>
    </form>
  );
}
