"use client";

import { AlertTriangle } from "lucide-react";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { ContextChannel, PricingContext } from "@/lib/cost-sheet";
import { formatCurrency } from "@/lib/format";
import { parseDecimal } from "@/lib/numbers";
import {
  type ChannelFees,
  type ProfitResult,
  isChannelConfigured,
  profitAtPrice,
  suggestPrice,
} from "@/lib/pricing";
import { cn } from "@/lib/utils";

const fees = (c: ContextChannel): ChannelFees => ({
  commissionPct: c.commission_pct,
  extraPct: c.extra_pct,
  fixedFee: c.fixed_fee,
});

const pctLabel = (v: number) => `${v.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`;

function ProfitLines({ r, minMarginPct }: { r: ProfitResult; minMarginPct: number }) {
  const loss = r.profit < 0;
  const belowMin = !loss && r.marginPct < minMarginPct;
  return (
    <dl className="grid grid-cols-2 gap-y-1 text-sm">
      <dt className="text-muted-foreground">Taxas do canal</dt>
      <dd className="text-right tabular-nums">−{formatCurrency(r.channelFees)}</dd>
      {r.tax > 0 && (
        <>
          <dt className="text-muted-foreground">Imposto</dt>
          <dd className="text-right tabular-nums">−{formatCurrency(r.tax)}</dd>
        </>
      )}
      <dt className="text-muted-foreground">Custo</dt>
      <dd className="text-right tabular-nums">−{formatCurrency(r.unitCost)}</dd>
      <dt className="border-t pt-1 font-medium">Lucro líquido</dt>
      <dd
        className={cn(
          "border-t pt-1 text-right font-semibold tabular-nums",
          loss ? "text-destructive" : belowMin ? "text-warning" : "text-success",
        )}
      >
        {formatCurrency(r.profit)} <span className="text-xs font-normal">({pctLabel(r.marginPct)})</span>
      </dd>
      {(loss || belowMin) && (
        <dd className={cn("col-span-2 text-xs", loss ? "text-destructive" : "text-warning")}>
          {loss ? "Prejuízo neste preço." : `Abaixo da margem mínima (${pctLabel(minMarginPct)}).`}
        </dd>
      )}
    </dl>
  );
}

export function ChannelPrices({
  unitCost,
  ctx,
  marginPct,
}: {
  unitCost: number;
  ctx: PricingContext;
  marginPct: number;
}) {
  const { tax_pct, rounding_rule, min_margin_pct } = ctx.settings;

  if (ctx.channels.length === 0) {
    return <p className="text-sm text-muted-foreground">Nenhum canal ativo. Ative em Configurações → Canais.</p>;
  }

  return (
    <div className="grid gap-4">
      <div className="grid gap-3 md:grid-cols-3">
        {ctx.channels.map((c) => {
          const r = suggestPrice(unitCost, fees(c), tax_pct, marginPct, rounding_rule);
          return (
            <Card key={c.id} className="gap-3 py-4">
              <CardHeader className="px-4">
                <CardTitle className="flex items-center justify-between gap-2 text-base">
                  {c.name}
                  {!isChannelConfigured(fees(c)) && (
                    <Badge variant="outline" className="text-warning">
                      Sem taxas
                    </Badge>
                  )}
                </CardTitle>
                {r.ok && (
                  <p className="text-3xl font-semibold tracking-tight tabular-nums">{formatCurrency(r.price)}</p>
                )}
              </CardHeader>
              <CardContent className="px-4">
                {r.ok ? (
                  <ProfitLines r={r} minMarginPct={min_margin_pct} />
                ) : (
                  <p role="alert" className="flex gap-2 text-sm text-destructive">
                    <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
                    {r.error} ({pctLabel(r.deductionsPct)})
                  </p>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>
      <ReverseMode unitCost={unitCost} ctx={ctx} />
    </div>
  );
}

/** "Quero vender por R$ X no canal Y: qual meu lucro?" */
function ReverseMode({ unitCost, ctx }: { unitCost: number; ctx: PricingContext }) {
  const [channelId, setChannelId] = useState(ctx.channels[0]?.id ?? "");
  const [price, setPrice] = useState("");
  const channel = ctx.channels.find((c) => c.id === channelId);
  const priceN = parseDecimal(price);
  const result =
    channel && priceN !== null && priceN > 0 ? profitAtPrice(priceN, unitCost, fees(channel), ctx.settings.tax_pct) : null;

  return (
    <Card className="gap-3 py-4">
      <CardHeader className="px-4">
        <CardTitle className="text-base">Modo inverso</CardTitle>
        <CardDescription>Quanto sobra vendendo por um preço que você escolher.</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4 px-4 sm:grid-cols-2">
        <div className="grid content-start gap-3">
          <div className="grid gap-1.5">
            <Label htmlFor="reverse-price">Quero vender por</Label>
            <div className="relative">
              <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-sm text-muted-foreground">
                R$
              </span>
              <Input
                id="reverse-price"
                inputMode="decimal"
                autoComplete="off"
                className="pl-10 tabular-nums"
                placeholder="39,90"
                value={price}
                onChange={(e) => setPrice(e.target.value)}
              />
            </div>
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="reverse-channel">no canal</Label>
            <Select value={channelId} onValueChange={setChannelId}>
              <SelectTrigger id="reverse-channel" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ctx.channels.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <div aria-live="polite">
          {result ? (
            <ProfitLines r={result} minMarginPct={ctx.settings.min_margin_pct} />
          ) : (
            <p className="text-sm text-muted-foreground">Digite um preço para ver o lucro.</p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
