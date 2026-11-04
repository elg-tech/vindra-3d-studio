"use client";

import { AlertTriangle } from "lucide-react";
import { Fragment, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { type ContextChannel, type PricingContext, creditChannelFees, channelFees as fees } from "@/lib/cost-sheet";
import { formatCurrency } from "@/lib/format";
import { parseDecimal } from "@/lib/numbers";
import {
  type CostResult,
  type ProfitResult,
  type SuggestedPrice,
  isChannelConfigured,
  kitCost,
  perPieceDiscountPct,
  profitAtPrice,
  suggestKitPrice,
} from "@/lib/pricing";
import { cn } from "@/lib/utils";

/** Preço manual digitado por kit e canal: chave `${peças}|${canal}`. */
export type ManualPrices = Record<string, string>;
export const manualKey = (piecesPerKit: number, channelId: string) => `${piecesPerKit}|${channelId}`;

const pctLabel = (v: number) => `${v.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`;
const kitLabel = (n: number) => `Kit ${n}`;
const piecesLabel = (n: number) => `${n} ${n === 1 ? "peça" : "peças"}`;

/** Preço manual válido (> 0) ou null. */
export function manualPrice(prices: ManualPrices, piecesPerKit: number, channelId: string): number | null {
  const n = parseDecimal(prices[manualKey(piecesPerKit, channelId)] ?? "");
  return n !== null && n > 0 ? n : null;
}

type KitChannel = {
  cost: number;
  suggested: SuggestedPrice;
  manual: ProfitResult | null;
  /** Preço usado no comparativo: o manual, se houver; senão o sugerido. */
  reference: ProfitResult | null;
};

function kitChannel(
  r: CostResult,
  n: number,
  c: ContextChannel,
  ctx: PricingContext,
  marginPct: number,
  prices: ManualPrices,
): KitChannel {
  const { tax_pct, rounding_rule } = ctx.settings;
  const cost = kitCost(r, n);
  const suggested = suggestKitPrice(r, n, fees(c), tax_pct, marginPct, rounding_rule);
  const price = manualPrice(prices, n, c.id);
  const manual = price !== null ? profitAtPrice(price, cost, fees(c), tax_pct) : null;
  return { cost, suggested, manual, reference: manual ?? (suggested.ok ? suggested : null) };
}

function ProfitLines({
  r,
  minMarginPct,
  fixedFee,
  credit,
}: {
  r: ProfitResult;
  minMarginPct: number;
  fixedFee: number;
  credit?: ProfitResult | null;
}) {
  const loss = r.profit < 0;
  const belowMin = !loss && r.marginPct < minMarginPct;
  return (
    // sem gap-x: o espaço entre colunas cortaria a linha acima de "Lucro"; o respiro fica no pl-4 dos valores
    <dl className="grid grid-cols-[auto_1fr] gap-y-1 text-sm">
      <dt className="text-muted-foreground">
        {credit ? "Taxas (Pix)" : "Taxas"}
        {fixedFee > 0 && <span className="text-xs"> · fixa 1×</span>}
      </dt>
      <dd className="pl-4 text-right tabular-nums">−{formatCurrency(r.channelFees)}</dd>
      {r.tax > 0 && (
        <>
          <dt className="text-muted-foreground">Imposto</dt>
          <dd className="pl-4 text-right tabular-nums">−{formatCurrency(r.tax)}</dd>
        </>
      )}
      <dt className="text-muted-foreground">Custo do kit</dt>
      <dd className="pl-4 text-right tabular-nums">−{formatCurrency(r.unitCost)}</dd>
      <dt className="border-t pt-1 font-medium">Lucro</dt>
      <dd
        className={cn(
          "border-t pt-1 pl-4 text-right font-semibold tabular-nums",
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
      {credit && (
        <dd className={cn("col-span-2 text-xs tabular-nums", credit.profit < 0 ? "text-destructive" : "text-muted-foreground")}>
          no crédito: lucro {formatCurrency(credit.profit)} (taxa {formatCurrency(credit.channelFees)})
        </dd>
      )}
    </dl>
  );
}

function creditAt(c: ContextChannel, r: ProfitResult, taxPct: number): ProfitResult | null {
  const credit = creditChannelFees(c);
  return credit ? profitAtPrice(r.price, r.unitCost, credit, taxPct) : null;
}

/** Card de um canal para um kit: preço sugerido, por peça, taxas, custo, lucro e o preço manual. */
function ChannelCard({
  r,
  n,
  c,
  ctx,
  marginPct,
  prices,
  onPriceChange,
}: {
  r: CostResult;
  n: number;
  c: ContextChannel;
  ctx: PricingContext;
  marginPct: number;
  prices: ManualPrices;
  onPriceChange: (key: string, value: string) => void;
}) {
  const k = kitChannel(r, n, c, ctx, marginPct, prices);
  const { tax_pct, min_margin_pct } = ctx.settings;
  const fixed = fees(c).fixedFee ?? 0;
  const inputId = `manual-${n}-${c.id}`;
  return (
    <Card className="gap-3 py-4">
      <CardHeader className="px-4">
        <CardTitle className="flex items-start justify-between gap-3 text-base">
          <span className="flex min-w-0 items-center gap-2">
            <span className="truncate">{c.name}</span>
            {!isChannelConfigured(fees(c)) && (
              <Badge variant="outline" className="text-warning">
                Sem taxas
              </Badge>
            )}
          </span>
          <span className="grid shrink-0 justify-items-end">
            <span className="text-2xl font-semibold tracking-tight tabular-nums">
              {k.suggested.ok ? formatCurrency(k.suggested.price) : "—"}
            </span>
            {k.suggested.ok && n > 1 && (
              <span className="text-xs font-normal text-muted-foreground tabular-nums">
                {formatCurrency(k.suggested.price / n)}/peça
              </span>
            )}
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent className="grid gap-3 px-4">
        {k.suggested.ok ? (
          <ProfitLines r={k.suggested} minMarginPct={min_margin_pct} fixedFee={fixed} credit={creditAt(c, k.suggested, tax_pct)} />
        ) : (
          <p role="alert" className="flex gap-2 text-sm text-destructive">
            <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
            {k.suggested.error} ({pctLabel(k.suggested.deductionsPct)})
          </p>
        )}
        <div className="grid gap-2 border-t pt-3">
          <label htmlFor={inputId} className="text-sm font-medium">
            Preço manual
          </label>
          <div className="relative">
            <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-sm text-muted-foreground">
              R$
            </span>
            <Input
              id={inputId}
              inputMode="decimal"
              autoComplete="off"
              className="pl-10 tabular-nums"
              placeholder={k.suggested.ok ? formatCurrency(k.suggested.price).replace("R$", "").trim() : "ex.: 39,90"}
              value={prices[manualKey(n, c.id)] ?? ""}
              onChange={(e) => onPriceChange(manualKey(n, c.id), e.target.value)}
            />
          </div>
          <div aria-live="polite">
            {k.manual && (
              <>
                {n > 1 && (
                  <p className="mb-1 text-xs text-muted-foreground tabular-nums">
                    {formatCurrency(k.manual.price / n)}/peça neste preço
                  </p>
                )}
                <ProfitLines r={k.manual} minMarginPct={min_margin_pct} fixedFee={fixed} credit={creditAt(c, k.manual, tax_pct)} />
              </>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

/** Uma linha do comparativo: preço do kit, por peça, desconto por peça vs. kit 1, lucro e margem. */
function compareRow(r: CostResult, n: number, c: ContextChannel, ctx: PricingContext, marginPct: number, prices: ManualPrices) {
  const k = kitChannel(r, n, c, ctx, marginPct, prices);
  const single = kitChannel(r, 1, c, ctx, marginPct, prices).reference;
  const ref = k.reference;
  return {
    ref,
    manual: k.manual !== null,
    perPiece: ref ? ref.price / n : null,
    discount: ref && single && n > 1 ? perPieceDiscountPct(ref.price, n, single.price) : null,
  };
}

function ProfitCell({ value, minMarginPct }: { value: ProfitResult | null; minMarginPct: number }) {
  if (!value) return <span className="text-muted-foreground">—</span>;
  const loss = value.profit < 0;
  const belowMin = !loss && value.marginPct < minMarginPct;
  return (
    <span className={cn("tabular-nums", loss ? "text-destructive" : belowMin ? "text-warning" : "text-success")}>
      {formatCurrency(value.profit)} <span className="text-xs">({pctLabel(value.marginPct)})</span>
    </span>
  );
}

const discountText = (d: number | null) => (d === null ? "—" : d >= 0 ? `−${pctLabel(d)}` : `+${pctLabel(-d)}`);

/** Tabela comparativa: kits nas linhas; preço, por peça, desconto e lucro por canal. */
function Comparison({
  r,
  kits,
  ctx,
  marginPct,
  prices,
}: {
  r: CostResult;
  kits: number[];
  ctx: PricingContext;
  marginPct: number;
  prices: ManualPrices;
}) {
  const min = ctx.settings.min_margin_pct;
  // divider: linha à esquerda do primeiro campo de cada canal (tabela do desktop)
  const header = (divider: boolean) => (
    <>
      <th scope="col" className={cn("px-2 py-1.5 text-right font-medium", divider && "border-l")}>
        Preço kit
      </th>
      <th scope="col" className="px-2 py-1.5 text-right font-medium">
        Por peça
      </th>
      <th scope="col" className="px-2 py-1.5 text-right font-medium">
        Desc./peça
      </th>
      <th scope="col" className="px-2 py-1.5 text-right font-medium">
        Lucro (margem)
      </th>
    </>
  );
  const cells = (n: number, c: ContextChannel, divider: boolean) => {
    const row = compareRow(r, n, c, ctx, marginPct, prices);
    return (
      <>
        <td className={cn("px-2 py-1.5 text-right tabular-nums whitespace-nowrap", divider && "border-l")}>
          {row.ref ? formatCurrency(row.ref.price) : "—"}
          {row.manual && (
            <Badge variant="outline" className="ml-1 px-1 py-0 text-[10px]">
              manual
            </Badge>
          )}
        </td>
        <td className="px-2 py-1.5 text-right tabular-nums whitespace-nowrap">
          {row.perPiece !== null ? formatCurrency(row.perPiece) : "—"}
        </td>
        <td className="px-2 py-1.5 text-right tabular-nums whitespace-nowrap">{discountText(row.discount)}</td>
        <td className="px-2 py-1.5 text-right whitespace-nowrap">
          <ProfitCell value={row.ref} minMarginPct={min} />
        </td>
      </>
    );
  };

  return (
    <>
      {/* desktop: todos os canais lado a lado */}
      <div className="hidden overflow-x-auto md:block">
        <table className="w-full text-sm" aria-label="Comparativo de kits por canal">
          <thead className="text-xs text-muted-foreground">
            <tr>
              <th scope="col" rowSpan={2} className="px-2 py-1.5 text-left align-bottom font-medium">
                Kit
              </th>
              {ctx.channels.map((c) => (
                <th key={c.id} scope="colgroup" colSpan={4} className="border-l px-2 pt-1.5 text-center font-semibold text-foreground">
                  {c.name}
                </th>
              ))}
            </tr>
            <tr className="border-b">
              {ctx.channels.map((c) => (
                <Fragment key={c.id}>{header(true)}</Fragment>
              ))}
            </tr>
          </thead>
          <tbody>
            {kits.map((n) => (
              <tr key={n} className="border-b last:border-b-0">
                <th scope="row" className="px-2 py-1.5 text-left font-medium whitespace-nowrap">
                  {kitLabel(n)}
                </th>
                {ctx.channels.map((c) => (
                  <Fragment key={c.id}>{cells(n, c, true)}</Fragment>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* celular: um canal por aba */}
      <Tabs defaultValue={ctx.channels[0]?.id} className="min-w-0 md:hidden">
        <TabsList className="w-full">
          {ctx.channels.map((c) => (
            <TabsTrigger key={c.id} value={c.id} className="min-w-0">
              <span className="truncate">{c.name}</span>
            </TabsTrigger>
          ))}
        </TabsList>
        {ctx.channels.map((c) => (
          <TabsContent key={c.id} value={c.id} className="min-w-0 overflow-x-auto">
            <table className="w-full text-sm" aria-label={`Comparativo de kits na ${c.name}`}>
              <thead className="border-b text-xs text-muted-foreground">
                <tr>
                  <th scope="col" className="px-2 py-1.5 text-left font-medium">
                    Kit
                  </th>
                  {header(false)}
                </tr>
              </thead>
              <tbody>
                {kits.map((n) => (
                  <tr key={n} className="border-b last:border-b-0">
                    <th scope="row" className="px-2 py-1.5 text-left font-medium whitespace-nowrap">
                      {kitLabel(n)}
                    </th>
                    {cells(n, c, false)}
                  </tr>
                ))}
              </tbody>
            </table>
          </TabsContent>
        ))}
      </Tabs>
      <p className="text-xs text-muted-foreground">
        Usa o preço manual quando digitado; senão, o sugerido. Desconto por peça em relação ao preço do kit de 1 no mesmo canal.
      </p>
    </>
  );
}

/**
 * Venda: para cada kit e canal, o preço sugerido com a margem, o preço por peça e o lucro; preço manual por
 * kit e canal; e a tabela comparativa. A taxa fixa do canal e os custos do pedido entram uma vez por kit.
 */
export function KitPrices({
  result,
  blockedMessage,
  ctx,
  marginPct,
  kits,
  prices,
  onPriceChange,
}: {
  /** null enquanto faltar filamento ou tempo: o custo ainda não diz nada. */
  result: CostResult | null;
  blockedMessage?: string;
  ctx: PricingContext;
  marginPct: number;
  kits: number[];
  prices: ManualPrices;
  onPriceChange: (key: string, value: string) => void;
}) {
  const [tab, setTab] = useState(String(kits[0] ?? 1));
  const current = kits.includes(Number(tab)) ? tab : String(kits[0] ?? 1);

  if (ctx.channels.length === 0) {
    return <p className="text-sm text-muted-foreground">Nenhum canal ativo. Ative em Configurações → Canais.</p>;
  }
  if (!result) {
    return <p className="text-sm text-muted-foreground">{blockedMessage ?? "Preencha filamento e tempo para ver os preços."}</p>;
  }

  return (
    <div className="grid min-w-0 gap-6 *:min-w-0">
      <Tabs value={current} onValueChange={setTab} className="min-w-0">
        <TabsList className="w-full sm:w-fit">
          {kits.map((n) => (
            <TabsTrigger key={n} value={String(n)}>
              {kitLabel(n)}
            </TabsTrigger>
          ))}
        </TabsList>
        {kits.map((n) => (
          <TabsContent key={n} value={String(n)} className="grid min-w-0 gap-3 pt-2">
            <p className="text-sm text-muted-foreground tabular-nums">
              Custo do kit ({piecesLabel(n)}): {n} × {formatCurrency(result.piece.total)} + {formatCurrency(result.order.total)} do
              pedido = <strong className="font-medium text-foreground">{formatCurrency(kitCost(result, n))}</strong>
            </p>
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {ctx.channels.map((c) => (
                <ChannelCard
                  key={c.id}
                  r={result}
                  n={n}
                  c={c}
                  ctx={ctx}
                  marginPct={marginPct}
                  prices={prices}
                  onPriceChange={onPriceChange}
                />
              ))}
            </div>
          </TabsContent>
        ))}
      </Tabs>

      <section className="grid min-w-0 gap-3" aria-labelledby="comparativo">
        <h3 id="comparativo" className="text-base font-semibold">
          Comparativo
        </h3>
        <Comparison r={result} kits={kits} ctx={ctx} marginPct={marginPct} prices={prices} />
      </section>
    </div>
  );
}
