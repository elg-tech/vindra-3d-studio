"use client";

import { AlertTriangle } from "lucide-react";
import { Controller } from "react-hook-form";
import { TextField } from "@/components/form/field";
import { SubmitButton } from "@/components/form/submit-button";
import { useActionForm } from "@/components/form/use-action-form";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import type { Tables } from "@/lib/supabase/database.types";
import { PAYMENT_METHODS, PAYMENT_METHOD_LABEL } from "@/lib/payment-fees";
import { toField } from "@/lib/validation/fields";
import { channelSchema, directChannelSchema } from "@/lib/validation/schemas";
import { saveChannel, saveDirectChannel } from "./actions";

/** Rótulos dos campos de taxa conforme o tipo de canal. */
const CHANNEL_COPY: Record<string, { extra: string; extraHint: string; fixedHint: string }> = {
  shopee: {
    extra: "Programa de frete grátis / campanhas",
    extraHint: "Percentual adicional cobrado se você participa do programa.",
    fixedHint: "Taxa fixa cobrada por item vendido.",
  },
  tiktok: {
    extra: "Taxa adicional",
    extraHint: "Afiliados, campanhas ou outras taxas percentuais.",
    fixedHint: "Taxa fixa por item, se houver.",
  },
  other: {
    extra: "Taxa adicional",
    extraHint: "Outras taxas percentuais.",
    fixedHint: "Taxa fixa por item.",
  },
};

export function ChannelsSection({ channels, taxPct }: { channels: Tables<"sales_channels">[]; taxPct: number }) {
  return (
    <div className="grid gap-4">
      <div
        role="note"
        className="flex gap-3 rounded-xl border border-warning/40 bg-warning/10 p-4 text-sm text-foreground"
      >
        <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden />
        <p>
          <strong>Confira as taxas atuais no painel do vendedor.</strong> Shopee e TikTok mudam as taxas com
          frequência; o sistema não preenche valores automaticamente. Campos vazios ficam como &ldquo;não
          configurado&rdquo; e a calculadora avisa.
        </p>
      </div>
      <div className="grid gap-4 lg:grid-cols-3">
        {channels.map((channel) =>
          channel.kind === "direct" ? (
            <DirectChannelCard key={channel.id} channel={channel} taxPct={taxPct} />
          ) : (
            <ChannelCard key={channel.id} channel={channel} taxPct={taxPct} />
          ),
        )}
      </div>
    </div>
  );
}

function ChannelCard({ channel, taxPct }: { channel: Tables<"sales_channels">; taxPct: number }) {
  const copy = CHANNEL_COPY[channel.kind] ?? CHANNEL_COPY.other;
  const { form, onSubmit, isPending } = useActionForm({
    schema: channelSchema,
    action: saveChannel,
    defaultValues: {
      id: channel.id,
      commission_pct: toField(channel.commission_pct),
      extra_pct: toField(channel.extra_pct),
      fixed_fee: toField(channel.fixed_fee),
      active: channel.active,
    },
  });
  const { register, control, formState } = form;
  const e = formState.errors;
  const configured = channel.commission_pct !== null || channel.extra_pct !== null || channel.fixed_fee !== null;

  return (
    <form onSubmit={onSubmit} noValidate>
      <Card className="h-full">
        <CardHeader>
          <CardTitle className="flex items-center justify-between gap-2">
            {channel.name}
            {!configured && <Badge variant="outline">Não configurado</Badge>}
          </CardTitle>
          <CardDescription>Imposto global de {toField(taxPct)}% entra no cálculo à parte.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          <TextField
            label="Comissão"
            registration={register("commission_pct")}
            error={e.commission_pct}
            numeric
            suffix="%"
            placeholder="—"
          />
          <TextField
            label={copy.extra}
            registration={register("extra_pct")}
            error={e.extra_pct}
            numeric
            suffix="%"
            placeholder="—"
            hint={copy.extraHint}
          />
          <TextField
            label="Taxa fixa por item"
            registration={register("fixed_fee")}
            error={e.fixed_fee}
            numeric
            prefix="R$"
            placeholder="—"
            hint={copy.fixedHint}
          />
          <Controller
            control={control}
            name="active"
            render={({ field }) => (
              <div className="flex items-center justify-between gap-3">
                <Label htmlFor={`active-${channel.id}`}>Canal ativo</Label>
                <Switch id={`active-${channel.id}`} checked={field.value} onCheckedChange={field.onChange} />
              </div>
            )}
          />
        </CardContent>
        <CardFooter className="justify-end">
          <SubmitButton pending={isPending}>Salvar</SubmitButton>
        </CardFooter>
      </Card>
    </form>
  );
}

const METHOD_HINT: Record<(typeof PAYMENT_METHODS)[number], string> = {
  pix: "0% se o Pix cai direto na sua conta.",
  cash: "Normalmente 0.",
  debit: "Taxa da maquininha no débito.",
  credit: "Taxa da maquininha no crédito à vista.",
};

/**
 * Venda direta: taxa por forma de pagamento. Cada pagamento do pedido paga a taxa da forma usada;
 * a calculadora e os produtos usam o Pix como padrão e mostram o lucro no crédito ao lado.
 */
function DirectChannelCard({ channel, taxPct }: { channel: Tables<"sales_channels">; taxPct: number }) {
  const { form, onSubmit, isPending } = useActionForm({
    schema: directChannelSchema,
    action: saveDirectChannel,
    defaultValues: {
      id: channel.id,
      pix_pct: toField(channel.pix_pct),
      pix_fixed: toField(channel.pix_fixed),
      cash_pct: toField(channel.cash_pct),
      cash_fixed: toField(channel.cash_fixed),
      debit_pct: toField(channel.debit_pct),
      debit_fixed: toField(channel.debit_fixed),
      credit_pct: toField(channel.credit_pct),
      credit_fixed: toField(channel.credit_fixed),
      active: channel.active,
    },
  });
  const { register, control, formState } = form;
  const e = formState.errors;

  return (
    <form onSubmit={onSubmit} noValidate>
      <Card className="h-full">
        <CardHeader>
          <CardTitle>{channel.name}</CardTitle>
          <CardDescription>
            Taxa por forma de pagamento, cobrada em cada pagamento do pedido. Imposto global de {toField(taxPct)}% à parte.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          {PAYMENT_METHODS.map((m) => (
            <fieldset key={m} className="grid gap-2">
              <legend className="mb-1 text-sm font-medium">{PAYMENT_METHOD_LABEL[m]}</legend>
              <div className="grid grid-cols-2 gap-3">
                <TextField
                  label="Percentual"
                  registration={register(`${m}_pct`)}
                  error={e[`${m}_pct`]}
                  numeric
                  suffix="%"
                  placeholder="0"
                />
                <TextField
                  label="Taxa fixa"
                  registration={register(`${m}_fixed`)}
                  error={e[`${m}_fixed`]}
                  numeric
                  prefix="R$"
                  placeholder="0"
                />
              </div>
              <p className="text-xs text-muted-foreground">{METHOD_HINT[m]}</p>
            </fieldset>
          ))}
          <Controller
            control={control}
            name="active"
            render={({ field }) => (
              <div className="flex items-center justify-between gap-3">
                <Label htmlFor={`active-${channel.id}`}>Canal ativo</Label>
                <Switch id={`active-${channel.id}`} checked={field.value} onCheckedChange={field.onChange} />
              </div>
            )}
          />
        </CardContent>
        <CardFooter className="justify-end">
          <SubmitButton pending={isPending}>Salvar</SubmitButton>
        </CardFooter>
      </Card>
    </form>
  );
}
