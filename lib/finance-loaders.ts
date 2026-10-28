import "server-only";
import type { FailureCost, FinanceOrder, FinanceSpool, ManualTransaction } from "@/lib/finance";
import type { OrderStatus, PaymentKind } from "@/lib/orders";
import type { createClient } from "@/lib/supabase/server";

type Supabase = Awaited<ReturnType<typeof createClient>>;

const ORDER_COLUMNS =
  "id, number, status, created_at, total_amount, channel_fees, shipping_cost, paid_by_platform, consumed_at, sales_channels(name, kind), order_payments(kind, amount, paid_on), order_items(quantity, unit_price, unit_cost, unit_labor_cost, print_minutes, description, variant_id, product_variants(product_id, products(name)))";

const PAYMENT_ORDER: Record<PaymentKind, number> = { deposit: 0, balance: 1, full: 2 };

/** Tudo de que o Financeiro e o Dashboard precisam para montar caixa, DRE e KPIs. */
export async function loadFinance(supabase: Supabase) {
  const [orders, spools, transactions, failures, settings] = await Promise.all([
    supabase.from("orders").select(ORDER_COLUMNS).order("created_at"),
    supabase.from("filaments").select("id, material, color_name, price_paid, shipping_cost, purchased_at, created_at, filament_brands(name)"),
    supabase.from("transactions").select("id, kind, category, description, gross_amount, occurred_on, is_fixed, order_id").order("occurred_on"),
    supabase.from("print_failures").select("cost, minutes_lost, occurred_at"),
    supabase.from("settings").select("tax_pct").maybeSingle(),
  ]);
  if (orders.error || spools.error || transactions.error || failures.error) {
    throw new Error("Não foi possível carregar o financeiro.");
  }

  const financeOrders: FinanceOrder[] = orders.data.map((o) => ({
    id: o.id,
    number: o.number,
    status: o.status as OrderStatus,
    createdAt: o.created_at,
    total: o.total_amount,
    channelFees: o.channel_fees,
    shipping: o.shipping_cost,
    paidByPlatform: o.paid_by_platform,
    consumedAt: o.consumed_at,
    channelName: o.sales_channels?.name ?? null,
    channelKind: o.sales_channels?.kind ?? null,
    payments: o.order_payments
      .map((p) => ({ kind: p.kind as PaymentKind, amount: p.amount, paidOn: p.paid_on }))
      .sort((a, b) => PAYMENT_ORDER[a.kind] - PAYMENT_ORDER[b.kind]),
    items: o.order_items.map((i) => ({
      quantity: i.quantity,
      unitPrice: i.unit_price,
      unitCost: i.unit_cost,
      unitLaborCost: i.unit_labor_cost,
      printMinutes: i.print_minutes,
      productKey: i.product_variants?.product_id ?? `item:${i.description}`,
      productName: i.product_variants?.products?.name ?? i.description,
    })),
  }));

  const financeSpools: FinanceSpool[] = spools.data.map((s) => ({
    id: s.id,
    label: `${s.material} ${s.color_name}${s.filament_brands?.name ? ` (${s.filament_brands.name})` : ""}`,
    pricePaid: s.price_paid,
    shippingCost: s.shipping_cost,
    purchasedAt: s.purchased_at,
    createdAt: s.created_at,
  }));

  const manual: ManualTransaction[] = transactions.data.map((t) => ({
    id: t.id,
    kind: t.kind as ManualTransaction["kind"],
    category: t.category,
    description: t.description,
    amount: t.gross_amount,
    occurredOn: t.occurred_on,
    isFixed: t.is_fixed,
    orderId: t.order_id,
  }));

  const failureCosts: (FailureCost & { minutes: number })[] = failures.data.map((f) => ({
    cost: f.cost,
    occurredAt: f.occurred_at,
    minutes: f.minutes_lost,
  }));

  return {
    orders: financeOrders,
    spools: financeSpools,
    transactions: manual,
    failures: failureCosts,
    taxPct: settings.data?.tax_pct ?? 0,
  };
}
