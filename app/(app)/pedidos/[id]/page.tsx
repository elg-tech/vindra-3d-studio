import { ArrowLeft } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatCurrency, formatDateTime, formatGrams, formatNumber } from "@/lib/format";
import { storedItemCost } from "@/lib/item-cost";
import { loadOrderDetail } from "@/lib/order-loaders";
import {
  ORDER_STATUS_LABEL,
  type OrderStatus,
  type PaymentKind,
  type PaymentMethod,
  formatMinutes,
  orderProfit,
  refundAmount,
} from "@/lib/orders";
import { paymentRates } from "@/lib/payment-fees";
import { createClient } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";
import { ItemCostSummary } from "../../calculadora/item-cost-dialog";
import { DueBadge, PaymentBadge } from "../order-badges";
import { ItemCostButton } from "./item-cost-button";
import { CancelOrder, DeleteOrder, DetailsForm, FailureDialog, PaymentsPanel, StatusPanel } from "./order-panels";

const isUuid = (id: string) => /^[0-9a-f-]{36}$/i.test(id);
const PAYMENT_ORDER: Record<string, number> = { deposit: 0, balance: 1, full: 2 };

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  if (!isUuid(id)) return { title: "Pedido" };
  const supabase = await createClient();
  const { data } = await supabase.from("orders").select("number").eq("id", id).maybeSingle();
  return { title: data?.number ?? "Pedido" };
}

export default async function PedidoPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!isUuid(id)) notFound();
  const supabase = await createClient();
  const detail = await loadOrderDetail(supabase, id);
  if (!detail) notFound();
  const { order: o, ctx, supplies, spools, expected, paymentState } = detail;

  const status = o.status as OrderStatus;
  const cancelled = status === "cancelled";
  const consumed = o.consumed_at !== null || o.filament_skipped;
  const failuresCost = o.print_failures.reduce((s, f) => s + f.cost, 0);
  const profit = orderProfit({
    total: o.total_amount,
    channelFees: o.channel_fees,
    taxPct: ctx.settings.tax_pct,
    shipping: o.shipping_cost,
    items: o.order_items.map((i) => ({ quantity: i.quantity, unitCost: i.unit_cost })),
    failuresCost,
  });
  const consumption = o.filament_movements.filter((m) => m.kind === "consumption");
  const printMinutes = o.order_items.reduce((s, i) => s + (i.print_minutes ?? 0), 0);

  return (
    <div className="grid gap-6">
      <div className="grid gap-3">
        <Button asChild variant="ghost" size="sm" className="w-fit">
          <Link href="/pedidos">
            <ArrowLeft aria-hidden /> Pedidos
          </Link>
        </Button>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <h1 className="text-2xl font-semibold tracking-tight tabular-nums md:text-3xl">{o.number}</h1>
          <Badge variant="outline" className={cn(cancelled && "border-destructive/40 text-destructive")}>
            {ORDER_STATUS_LABEL[status]}
          </Badge>
          {!cancelled && <PaymentBadge state={paymentState} />}
          {!cancelled && <DueBadge dueDate={o.due_date} status={status} />}
        </div>
        <p className="text-sm text-muted-foreground">
          {o.customers ? (
            <Link href={`/clientes/${o.customers.id}`} className="underline underline-offset-4">
              {o.customers.name}
            </Link>
          ) : (
            "Sem cliente"
          )}
          {o.sales_channels && ` · ${o.sales_channels.name}`}
          {o.platform_order_number && ` · pedido #${o.platform_order_number}`}
          {o.quotes && (
            <>
              {" · do orçamento "}
              <Link href={`/orcamentos/${o.quotes.id}`} className="underline underline-offset-4">
                {o.quotes.number}
              </Link>
            </>
          )}
        </p>
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,22rem)] lg:items-start">
        <div className="grid min-w-0 gap-4">
          <Card>
            <CardHeader>
              <CardTitle>Itens</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4">
              <ul className="divide-y text-sm">
                {o.order_items.map((i) => {
                  // item avulso (sem produto nem ficha): custo pela mini calculadora ou manual, em qualquer status
                  const avulso = !i.variant_id && !i.cost_sheet_id;
                  return (
                    <li
                      key={i.id}
                      id={`item-${i.id}`}
                      className="grid scroll-mt-24 gap-1.5 rounded-md py-2 target:bg-warning/10 target:ring-2 target:ring-warning/50"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <span className="min-w-0">
                          <span className="block font-medium break-words">{i.description}</span>
                          <span className="text-muted-foreground tabular-nums">
                            {i.quantity} × {formatCurrency(i.unit_price)}
                            {i.print_minutes ? ` · ${formatMinutes(i.print_minutes)} de impressão` : ""}
                          </span>
                        </span>
                        <span className="shrink-0 tabular-nums">{formatCurrency(i.quantity * i.unit_price)}</span>
                      </div>
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <ItemCostSummary unitCost={i.unit_cost} quantity={i.quantity} unitPrice={i.unit_price} />
                        {avulso ? (
                          <ItemCostButton
                            itemId={i.id}
                            description={i.description}
                            quantity={i.quantity}
                            unitPrice={i.unit_price}
                            value={storedItemCost(i.cost_source, i.cost_input)}
                            hasCost={i.unit_cost !== null}
                            ctx={ctx}
                            supplies={supplies}
                          />
                        ) : (
                          i.unit_cost === null && (
                            <span className="text-xs text-muted-foreground">Ficha sem custo: corrija na calculadora ou no produto.</span>
                          )
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
              <dl className="grid grid-cols-[1fr_auto] gap-y-1 border-t pt-3 text-sm">
                {o.discount_amount > 0 && (
                  <>
                    <dt className="text-muted-foreground">Desconto</dt>
                    <dd className="text-right tabular-nums">−{formatCurrency(o.discount_amount)}</dd>
                  </>
                )}
                {o.shipping_cost > 0 && (
                  <>
                    <dt className="text-muted-foreground">Frete</dt>
                    <dd className="text-right tabular-nums">{formatCurrency(o.shipping_cost)}</dd>
                  </>
                )}
                <dt className="font-medium">Total</dt>
                <dd className="text-right text-lg font-semibold tabular-nums">{formatCurrency(o.total_amount)}</dd>
              </dl>
              <div className="grid gap-1 rounded-lg bg-muted/50 p-3 text-sm">
                <p className="text-xs font-medium text-muted-foreground">Só você vê</p>
                <dl className="grid grid-cols-[1fr_auto] gap-y-1">
                  <dt className="text-muted-foreground">Custo das peças</dt>
                  <dd className="text-right tabular-nums">{profit.itemsCost === null ? "—" : formatCurrency(profit.itemsCost)}</dd>
                  <dt className="text-muted-foreground">Taxas do canal e imposto</dt>
                  <dd className="text-right tabular-nums">−{formatCurrency(o.channel_fees + profit.tax)}</dd>
                  {failuresCost > 0 && (
                    <>
                      <dt className="text-muted-foreground">Falhas</dt>
                      <dd className="text-right tabular-nums">−{formatCurrency(failuresCost)}</dd>
                    </>
                  )}
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
                {profit.itemsCost === null && (
                  <p className="text-xs text-muted-foreground">Item sem custo: lucro não calculado. Use &ldquo;Definir custo&rdquo; no item.</p>
                )}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Produção</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-3 text-sm">
              {printMinutes > 0 && <p>Tempo de impressão previsto: {formatMinutes(printMinutes)}</p>}
              <div className="grid gap-1">
                <p className="font-medium">Filamento</p>
                {o.filament_skipped ? (
                  <p className="text-muted-foreground">Movido sem baixa de filamento.</p>
                ) : consumption.length > 0 ? (
                  <ul className="text-muted-foreground">
                    {consumption.map((m, i) => (
                      <li key={i} className="tabular-nums">
                        {m.filaments ? `${m.filaments.material} ${m.filaments.color_name}` : "Carretel excluído"}: {formatGrams(Math.abs(m.grams))}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-muted-foreground">
                    {cancelled ? "Sem baixa." : "Ainda não baixado: acontece ao mover para “Imprimindo”."}
                    {!cancelled && expected.length > 0 && (
                      <span className="block tabular-nums">
                        Previsto: {expected.map((l) => `${l.material} ${formatGrams(l.grams)}`).join(", ")}
                      </span>
                    )}
                  </p>
                )}
              </div>
              {o.print_failures.length > 0 && (
                <div className="grid gap-1">
                  <p className="font-medium">Falhas</p>
                  <ul className="grid gap-1 text-muted-foreground">
                    {o.print_failures.map((f) => (
                      <li key={f.id} className="tabular-nums">
                        {formatDateTime(f.occurred_at)} · {f.filaments ? `${f.filaments.material} ${f.filaments.color_name}` : "sem carretel"} ·{" "}
                        {formatGrams(f.grams_lost)} · {formatMinutes(f.minutes_lost)} · {formatCurrency(f.cost)}
                        {f.reason && ` · ${f.reason}`}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="grid gap-4 lg:sticky lg:top-20">
          {!cancelled && (
            <Card>
              <CardContent className="grid gap-3 pt-6">
                <StatusPanel
                  order={{ id: o.id, number: o.number, consumed, paymentState, expected }}
                  status={status}
                  spools={spools}
                />
                <FailureDialog orderId={o.id} spools={spools} />
              </CardContent>
            </Card>
          )}
          <PaymentsPanel
            orderId={o.id}
            payments={[...o.order_payments]
              .sort((a, b) => PAYMENT_ORDER[a.kind] - PAYMENT_ORDER[b.kind])
              .map((p) => ({
                kind: p.kind as PaymentKind,
                amount: p.amount,
                paidOn: p.paid_on,
                method: p.method as PaymentMethod | null,
                fee: p.fee_amount,
              }))}
            // Venda direta: taxa por forma de pagamento (prevista no diálogo, gravada em cada pagamento)
            rates={o.sales_channels?.kind === "direct" ? paymentRates(o.sales_channels) : null}
            paidByPlatform={o.paid_by_platform}
            channelName={o.sales_channels?.name ?? null}
            cancelled={cancelled}
          />
          <Card>
            <CardHeader>
              <CardTitle>Entrega</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-3">
              <DetailsForm orderId={o.id} trackingCode={o.tracking_code} dueDate={o.due_date} notes={o.notes} disabled={cancelled} />
              <div className="grid gap-1">
                {!cancelled && (
                  <CancelOrder
                    orderId={o.id}
                    number={o.number}
                    consumed={o.consumed_at !== null}
                    refund={refundAmount({
                      paidByPlatform: o.paid_by_platform,
                      total: o.total_amount,
                      channelFees: o.channel_fees,
                      payments: o.order_payments.map((p) => ({ kind: p.kind as PaymentKind, amount: p.amount, paidOn: p.paid_on })),
                    })}
                  />
                )}
                <DeleteOrder orderId={o.id} number={o.number} fromQuote={o.quotes?.number ?? null} />
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
