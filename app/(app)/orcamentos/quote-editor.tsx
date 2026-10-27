"use client";

import {
  AlertTriangle,
  CheckCircle2,
  Copy,
  CopyPlus,
  ExternalLink,
  FileDown,
  Lock,
  MessageCircle,
  Plus,
  Trash2,
  XCircle,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { Controller, useFieldArray, useWatch } from "react-hook-form";
import { toast } from "sonner";
import { ConfirmDelete } from "@/components/confirm-delete";
import { FieldShell, TextAreaField, TextField } from "@/components/form/field";
import { SubmitButton } from "@/components/form/submit-button";
import { useActionForm } from "@/components/form/use-action-form";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { formatCurrency, formatDateTime, formatNumber } from "@/lib/format";
import { parseDecimal } from "@/lib/numbers";
import type { ChannelFees } from "@/lib/pricing";
import type { QuoteCatalogOption } from "@/lib/quote-catalog";
import { type QuoteStatus, quoteMessage, quoteProfit, quoteTotals, whatsappLink } from "@/lib/quotes";
import { cn } from "@/lib/utils";
import { type QuoteInput, quoteSchema } from "@/lib/validation/schemas";
import { deleteQuote, duplicateQuote, markQuoteSent, saveQuote, setQuoteOutcome } from "./actions";
import { QuoteStatusBadge } from "./quote-status-badge";

export type CustomerOption = { id: string; name: string; whatsapp: string | null };

export type ExistingQuote = {
  id: string;
  number: string;
  token: string;
  status: QuoteStatus;
  approvedAt: string | null;
  rejectedAt: string | null;
};

const ADD_PLACEHOLDER = "add";
const num = (v: string | undefined) => parseDecimal(v ?? "") ?? 0;
const priceText = (n: number | null) => (n === null ? "" : n.toFixed(2).replace(".", ","));

export function QuoteEditor({
  quote,
  initialValues,
  customers,
  catalog,
  directFees,
  taxPct,
  storeName,
  siteUrl,
  warnings,
}: {
  quote: ExistingQuote | null;
  initialValues: QuoteInput;
  customers: CustomerOption[];
  catalog: QuoteCatalogOption[];
  directFees: ChannelFees;
  taxPct: number;
  storeName: string;
  siteUrl: string;
  /** Pix ou WhatsApp da loja sem configurar. */
  warnings: string[];
}) {
  const router = useRouter();
  const locked = quote?.status === "approved" || quote?.status === "rejected";

  const { form, onSubmit, isPending } = useActionForm({
    schema: quoteSchema,
    action: saveQuote,
    defaultValues: initialValues,
    onSuccess: (data) => {
      if (!quote && data?.id) router.push(`/orcamentos/${data.id}`);
      else router.refresh();
    },
  });
  const { control, register, formState } = form;
  const e = formState.errors;
  const items = useFieldArray({ control, name: "items" });
  const values = useWatch({ control }) as QuoteInput;

  // resumo ao vivo com o custo atual de cada ficha (o salvo é recalculado no servidor)
  const costById = new Map(catalog.map((o) => [o.id, o.cost]));
  const amounts = {
    items: (values.items ?? []).map((i) => ({
      quantity: num(i.quantity),
      unitPrice: num(i.unitPrice),
      unitCost: i.variantId ? (costById.get(i.variantId) ?? null) : i.costSheetId ? (costById.get(i.costSheetId) ?? null) : null,
    })),
    discountType: values.discountType ?? "amount",
    discountValue: num(values.discountValue),
    shippingCost: num(values.shippingCost),
    depositPct: parseDecimal(values.depositPct ?? ""),
  };
  const totals = quoteTotals(amounts);
  const profit = quoteProfit(amounts, directFees, taxPct);

  function addFromCatalog(value: string) {
    const option = catalog.find((o) => `${o.kind}:${o.id}` === value);
    if (!option) return;
    items.append({
      variantId: option.kind === "variant" ? option.id : "",
      costSheetId: option.kind === "sheet" ? option.id : "",
      description: option.label,
      quantity: "1",
      unitPrice: priceText(option.price),
    });
  }

  const customer = customers.find((c) => c.id === values.customerId);
  const variants = catalog.filter((o) => o.kind === "variant");
  const sheets = catalog.filter((o) => o.kind === "sheet");

  return (
    <form onSubmit={onSubmit} noValidate className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,22rem)] lg:items-start">
      <fieldset disabled={locked} className="grid min-w-0 gap-4">
        {locked && (
          <p className="flex items-center gap-2 rounded-lg border bg-muted/40 px-3 py-2 text-sm">
            <Lock className="size-4 shrink-0" aria-hidden />
            {quote?.status === "approved" ? "Aprovado" : "Recusado"}
            {(quote?.approvedAt ?? quote?.rejectedAt) && ` em ${formatDateTime((quote?.approvedAt ?? quote?.rejectedAt)!)}`}. Para
            mudar, use &ldquo;Duplicar&rdquo;.
          </p>
        )}

        <Card>
          <CardHeader>
            <CardTitle>Cliente</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4">
            <Controller
              control={control}
              name="customerMode"
              render={({ field }) => (
                <Tabs value={field.value} onValueChange={field.onChange}>
                  <TabsList className="w-full">
                    <TabsTrigger value="existing" disabled={customers.length === 0}>
                      Cadastrado
                    </TabsTrigger>
                    <TabsTrigger value="new">Novo</TabsTrigger>
                    <TabsTrigger value="none">Sem cliente</TabsTrigger>
                  </TabsList>
                </Tabs>
              )}
            />
            {values.customerMode === "existing" && (
              <FieldShell label="Cliente" error={e.customerId}>
                {({ id, describedBy, invalid }) => (
                  <Controller
                    control={control}
                    name="customerId"
                    render={({ field }) => (
                      <Select value={field.value || undefined} onValueChange={field.onChange}>
                        <SelectTrigger id={id} aria-describedby={describedBy} aria-invalid={invalid} className="w-full">
                          <SelectValue placeholder="Escolha o cliente" />
                        </SelectTrigger>
                        <SelectContent>
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
            )}
            {values.customerMode === "new" && (
              <div className="grid gap-4 sm:grid-cols-2">
                <TextField label="Nome" registration={register("newCustomerName")} error={e.newCustomerName} />
                <TextField
                  label="WhatsApp"
                  registration={register("newCustomerWhatsapp")}
                  error={e.newCustomerWhatsapp}
                  type="tel"
                  inputMode="tel"
                  placeholder="(16) 99999-9999"
                  hint="O cliente é cadastrado ao salvar."
                />
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Itens</CardTitle>
            <CardDescription>Preço do catálogo na venda direta; edite à vontade.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3">
            {e.items?.root?.message && (
              <p role="alert" className="text-sm text-destructive">
                {e.items.root.message}
              </p>
            )}
            {items.fields.map((field, i) => {
              const ie = e.items?.[i];
              // logo após adicionar, os valores observados ainda não têm a linha nova
              const line = amounts.items[i] ?? { quantity: 0, unitPrice: 0, unitCost: null };
              return (
                <div key={field.id} className="grid gap-2 rounded-lg border p-3">
                  <div className="flex items-start gap-2">
                    <TextField
                      label={`Item ${i + 1}`}
                      registration={register(`items.${i}.description`)}
                      error={ie?.description}
                      className="min-w-0 flex-1"
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="mt-6"
                      onClick={() => items.remove(i)}
                      aria-label={`Remover item ${i + 1}`}
                    >
                      <Trash2 aria-hidden />
                    </Button>
                  </div>
                  <div className="grid grid-cols-[5rem_minmax(0,1fr)] gap-2 sm:grid-cols-[5rem_10rem_minmax(0,1fr)] sm:items-end">
                    <TextField
                      label="Qtd."
                      registration={register(`items.${i}.quantity`)}
                      error={ie?.quantity}
                      numeric
                      inputMode="numeric"
                    />
                    <TextField
                      label="Preço unitário"
                      registration={register(`items.${i}.unitPrice`)}
                      error={ie?.unitPrice}
                      numeric
                      prefix="R$"
                    />
                    <p className="col-span-2 text-sm text-muted-foreground tabular-nums sm:col-span-1 sm:pb-2 sm:text-right">
                      {formatCurrency(line.quantity * line.unitPrice)}
                      {line.unitCost !== null && (
                        <span className="block text-xs">custo {formatCurrency(line.unitCost)}/peça</span>
                      )}
                    </p>
                  </div>
                </div>
              );
            })}
            <div className="flex flex-wrap gap-2">
              {catalog.length > 0 && (
                <Select value={ADD_PLACEHOLDER} onValueChange={addFromCatalog}>
                  <SelectTrigger className="w-full sm:w-72" aria-label="Adicionar do catálogo ou de uma ficha">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={ADD_PLACEHOLDER} disabled className="hidden">
                      <Plus aria-hidden /> Adicionar do catálogo…
                    </SelectItem>
                    {variants.length > 0 && (
                      <SelectGroup>
                        <SelectLabel>Produtos</SelectLabel>
                        {variants.map((o) => (
                          <SelectItem key={o.id} value={`variant:${o.id}`}>
                            {o.label}
                            {o.price !== null && <span className="text-muted-foreground"> · {formatCurrency(o.price)}</span>}
                          </SelectItem>
                        ))}
                      </SelectGroup>
                    )}
                    {sheets.length > 0 && (
                      <SelectGroup>
                        <SelectLabel>Fichas da calculadora</SelectLabel>
                        {sheets.map((o) => (
                          <SelectItem key={o.id} value={`sheet:${o.id}`}>
                            {o.label}
                            {o.price !== null && <span className="text-muted-foreground"> · {formatCurrency(o.price)}</span>}
                          </SelectItem>
                        ))}
                      </SelectGroup>
                    )}
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
          <CardHeader>
            <CardTitle>Condições</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-1.5">
              <Label htmlFor="discountValue">Desconto</Label>
              <div className="flex gap-2">
                <Controller
                  control={control}
                  name="discountType"
                  render={({ field }) => (
                    <Select value={field.value} onValueChange={field.onChange}>
                      <SelectTrigger className="w-20" aria-label="Tipo de desconto">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="amount">R$</SelectItem>
                        <SelectItem value="percent">%</SelectItem>
                      </SelectContent>
                    </Select>
                  )}
                />
                <Input
                  id="discountValue"
                  inputMode="decimal"
                  autoComplete="off"
                  className="tabular-nums"
                  aria-invalid={Boolean(e.discountValue)}
                  {...register("discountValue")}
                />
              </div>
              {e.discountValue && <p className="text-xs text-destructive">{e.discountValue.message}</p>}
            </div>
            <TextField label="Frete" registration={register("shippingCost")} error={e.shippingCost} numeric prefix="R$" />
            <TextField
              label="Sinal"
              registration={register("depositPct")}
              error={e.depositPct}
              numeric
              suffix="%"
              placeholder="sem sinal"
              hint="Com sinal, o Pix cobra só o sinal."
            />
            <TextField
              label="Prazo de produção"
              registration={register("productionDays")}
              error={e.productionDays}
              numeric
              inputMode="numeric"
              suffix="dias úteis"
            />
            <TextField label="Válido até" registration={register("validUntil")} error={e.validUntil} type="date" />
            <TextAreaField
              label="Condições de pagamento"
              registration={register("paymentTerms")}
              error={e.paymentTerms}
              rows={3}
              placeholder="Vazio usa as condições padrão das Configurações."
              className="sm:col-span-2"
            />
            <TextAreaField label="Observações" registration={register("notes")} error={e.notes} rows={3} className="sm:col-span-2" />
          </CardContent>
        </Card>
      </fieldset>

      <div className="grid gap-4 lg:sticky lg:top-20">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center justify-between gap-2">
              {quote ? quote.number : "Novo orçamento"}
              {quote && <QuoteStatusBadge status={quote.status} />}
            </CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4">
            <dl className="grid grid-cols-[1fr_auto] gap-y-1 text-sm">
              <dt className="text-muted-foreground">Subtotal</dt>
              <dd className="text-right tabular-nums">{formatCurrency(totals.subtotal)}</dd>
              {totals.discount > 0 && (
                <>
                  <dt className="text-muted-foreground">Desconto</dt>
                  <dd className="text-right tabular-nums">−{formatCurrency(totals.discount)}</dd>
                </>
              )}
              {totals.shipping > 0 && (
                <>
                  <dt className="text-muted-foreground">Frete</dt>
                  <dd className="text-right tabular-nums">{formatCurrency(totals.shipping)}</dd>
                </>
              )}
              <dt className="border-t pt-1 font-medium">Total</dt>
              <dd className="border-t pt-1 text-right text-xl font-semibold tabular-nums">{formatCurrency(totals.total)}</dd>
              {totals.deposit !== null && (
                <>
                  <dt className="text-muted-foreground">Sinal</dt>
                  <dd className="text-right tabular-nums">{formatCurrency(totals.deposit)}</dd>
                </>
              )}
            </dl>

            <div className="grid gap-1 rounded-lg bg-muted/50 p-3 text-sm">
              <p className="text-xs font-medium text-muted-foreground">Só você vê</p>
              <dl className="grid grid-cols-[1fr_auto] gap-y-1">
                <dt className="text-muted-foreground">Custo das peças</dt>
                <dd className="text-right tabular-nums">{profit.itemsCost === null ? "—" : formatCurrency(profit.itemsCost)}</dd>
                <dt className="text-muted-foreground">Taxas e imposto</dt>
                <dd className="text-right tabular-nums">−{formatCurrency(profit.channelFees + profit.tax)}</dd>
                <dt className="font-medium">Lucro</dt>
                <dd
                  className={cn(
                    "text-right font-semibold tabular-nums",
                    profit.profit !== null && profit.profit < 0 ? "text-destructive" : "text-success",
                  )}
                >
                  {profit.profit === null ? "—" : formatCurrency(profit.profit)}
                  {profit.marginPct !== null && (
                    <span className="text-xs font-normal"> ({formatNumber(Math.round(profit.marginPct * 10) / 10)}%)</span>
                  )}
                </dd>
              </dl>
              {profit.itemsCost === null && amounts.items.length > 0 && (
                <p className="text-xs text-muted-foreground">Item avulso ou sem ficha: lucro não calculado.</p>
              )}
            </div>

            {!locked && (
              <SubmitButton pending={isPending}>{quote ? "Salvar alterações" : "Criar orçamento"}</SubmitButton>
            )}
          </CardContent>
        </Card>

        {warnings.length > 0 && (
          <ul className="grid gap-1 rounded-lg border border-warning/40 bg-warning/10 p-3 text-xs">
            {warnings.map((w) => (
              <li key={w} className="flex gap-2">
                <AlertTriangle className="mt-0.5 size-3.5 shrink-0 text-warning" aria-hidden />
                {w}
              </li>
            ))}
          </ul>
        )}

        {quote && (
          <QuoteActions
            quote={quote}
            dirty={formState.isDirty}
            customerName={values.customerMode === "existing" ? (customer?.name ?? null) : values.customerMode === "new" ? (values.newCustomerName ?? null) : null}
            customerWhatsapp={values.customerMode === "existing" ? (customer?.whatsapp ?? null) : (values.newCustomerWhatsapp ?? null)}
            total={totals.total}
            validUntil={values.validUntil || null}
            storeName={storeName}
            siteUrl={siteUrl}
          />
        )}
      </div>
    </form>
  );
}

function QuoteActions({
  quote,
  dirty,
  customerName,
  customerWhatsapp,
  total,
  validUntil,
  storeName,
  siteUrl,
}: {
  quote: ExistingQuote;
  dirty: boolean;
  customerName: string | null;
  customerWhatsapp: string | null;
  total: number;
  validUntil: string | null;
  storeName: string;
  siteUrl: string;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const publicUrl = `${siteUrl}/o/${quote.token}`;
  const open = quote.status === "draft" || quote.status === "sent" || quote.status === "expired";

  const run = (action: () => Promise<{ ok: boolean; error?: string; message?: string }>, after?: (ok: boolean) => void) =>
    startTransition(async () => {
      const result = await action();
      if (!result.ok) toast.error(result.error ?? "Não foi possível concluir.");
      else if (result.message) toast.success(result.message);
      after?.(result.ok);
      router.refresh();
    });

  function blockIfDirty(): boolean {
    if (dirty) toast.error("Salve as alterações antes de enviar: o cliente veria a versão antiga.");
    return dirty;
  }

  function sendWhatsapp() {
    if (blockIfDirty()) return;
    const text = quoteMessage({ customerName, storeName, number: quote.number, total, validUntil, link: publicUrl });
    // abre já no clique (bloqueadores de pop-up), depois marca como enviado
    window.open(whatsappLink(customerWhatsapp, text), "_blank", "noopener,noreferrer");
    run(() => markQuoteSent(quote.id));
  }

  async function copyLink() {
    if (blockIfDirty()) return;
    try {
      await navigator.clipboard.writeText(publicUrl);
      toast.success("Link copiado.");
      run(() => markQuoteSent(quote.id));
    } catch {
      toast.error("Não foi possível copiar o link.");
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Enviar e acompanhar</CardTitle>
        {quote.status === "draft" && (
          <CardDescription>Ao enviar ou copiar o link, o rascunho vira &ldquo;Enviado&rdquo; e a página do cliente é liberada.</CardDescription>
        )}
      </CardHeader>
      <CardContent className="grid gap-2">
        {open && (
          <>
            <Button type="button" onClick={sendWhatsapp} disabled={isPending}>
              <MessageCircle aria-hidden /> Enviar no WhatsApp
            </Button>
            <Button type="button" variant="outline" onClick={copyLink} disabled={isPending}>
              <Copy aria-hidden /> Copiar link do cliente
            </Button>
          </>
        )}
        {quote.status !== "draft" && (
          <Button asChild variant="outline">
            <a href={publicUrl} target="_blank" rel="noopener noreferrer">
              <ExternalLink aria-hidden /> Abrir página do cliente
            </a>
          </Button>
        )}
        <Button asChild variant="outline">
          <a href={`/orcamentos/${quote.id}/pdf`} target="_blank" rel="noopener noreferrer">
            <FileDown aria-hidden /> Baixar PDF
          </a>
        </Button>
        {open && (
          <div className="grid grid-cols-2 gap-2 pt-2">
            <Button type="button" variant="outline" disabled={isPending} onClick={() => run(() => setQuoteOutcome(quote.id, "approved"))}>
              <CheckCircle2 aria-hidden /> Aprovado
            </Button>
            <Button type="button" variant="outline" disabled={isPending} onClick={() => run(() => setQuoteOutcome(quote.id, "rejected"))}>
              <XCircle aria-hidden /> Recusado
            </Button>
          </div>
        )}
        <div className="flex flex-wrap items-center justify-between gap-2 pt-2">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={isPending}
            onClick={() =>
              startTransition(async () => {
                const result = await duplicateQuote(quote.id);
                if (!result.ok) toast.error(result.error);
                else {
                  toast.success(result.message);
                  if (result.data) router.push(`/orcamentos/${result.data.id}`);
                }
              })
            }
          >
            <CopyPlus aria-hidden /> Duplicar
          </Button>
          <ConfirmDelete
            title={`Excluir ${quote.number}?`}
            description="O link do cliente deixa de funcionar. O número não é reaproveitado."
            onConfirm={() => deleteQuote(quote.id)}
            onDone={() => router.push("/orcamentos")}
          />
        </div>
        <p className="pt-1 text-xs text-muted-foreground">
          <Link href="/configuracoes" className="underline underline-offset-4">
            Dados da loja e Pix
          </Link>{" "}
          aparecem na página e no PDF.
        </p>
      </CardContent>
    </Card>
  );
}
