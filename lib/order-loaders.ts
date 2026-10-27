import "server-only";
import { subDays } from "date-fns";
import { loadSheets } from "@/lib/catalog";
import type { PricingContext, SheetData } from "@/lib/cost-sheet";
import {
  type ConsumptionLine,
  type OrderPayment,
  type OrderStatus,
  type PaymentKind,
  type PaymentState,
  expectedConsumption,
  paymentState,
  queueMinutes,
  suggestSpool,
} from "@/lib/orders";
import { loadPricingContext } from "@/lib/pricing-context";
import type { createClient } from "@/lib/supabase/server";

type Supabase = Awaited<ReturnType<typeof createClient>>;

export type ExpectedLine = ConsumptionLine & { suggestedSpoolId: string | null };

/** Carretel para escolher na baixa ou na falha. */
export type SpoolOption = {
  id: string;
  label: string;
  material: string;
  colorHex: string;
  remainingG: number;
  costPerGram: number | null;
  inStock: boolean;
};

export type BoardOrder = {
  id: string;
  number: string;
  status: OrderStatus;
  boardPosition: number;
  statusChangedAt: string;
  dueDate: string | null;
  total: number;
  customerName: string | null;
  channelName: string | null;
  platformOrderNumber: string | null;
  itemCount: number;
  printMinutes: number;
  paymentState: PaymentState;
  /** Filamento já baixado (ou movido de propósito sem baixa). */
  consumed: boolean;
  expected: ExpectedLine[];
};

const ORDER_COLUMNS =
  "id, number, status, board_position, status_changed_at, due_date, total_amount, paid_by_platform, consumed_at, filament_skipped, platform_order_number, customers(name), sales_channels(name), order_items(quantity, print_minutes, cost_sheet_id), order_payments(kind, amount, paid_on)";

export function spoolOptions(ctx: PricingContext): SpoolOption[] {
  return ctx.spools.map((s) => ({
    id: s.id,
    label: `${s.material} ${s.color_name}${s.brand ? ` (${s.brand})` : ""}`,
    material: s.material,
    colorHex: s.color_hex,
    remainingG: s.remaining_g,
    costPerGram: s.cost_per_gram,
    inStock: s.status !== "empty" && s.remaining_g > 0,
  }));
}

function expectedFor(
  items: { quantity: number; cost_sheet_id: string | null }[],
  sheets: Map<string, SheetData>,
  ctx: PricingContext,
): ExpectedLine[] {
  const lines = expectedConsumption(
    items.map((i) => ({ sheet: (i.cost_sheet_id && sheets.get(i.cost_sheet_id)) || null, quantity: i.quantity })),
  );
  return lines.map((l) => ({ ...l, suggestedSpoolId: suggestSpool(l, ctx.spools)?.id ?? null }));
}

const toPayments = (rows: { kind: string; amount: number; paid_on: string | null }[]): OrderPayment[] =>
  rows.map((p) => ({ kind: p.kind as PaymentKind, amount: p.amount, paidOn: p.paid_on }));

/** Kanban: pedidos abertos (entregues só dos últimos 30 dias), fila e falha real. */
export async function loadBoard(supabase: Supabase) {
  const since30 = subDays(new Date(), 30).toISOString();
  const since90 = subDays(new Date(), 90).toISOString();
  const [ctx, sheets, { data, error }, { data: failures }, { data: produced }] = await Promise.all([
    loadPricingContext(supabase),
    loadSheets(supabase),
    supabase
      .from("orders")
      .select(ORDER_COLUMNS)
      .neq("status", "cancelled")
      .or(`status.neq.delivered,status_changed_at.gte.${since30}`)
      .order("board_position")
      .order("created_at"),
    supabase.from("print_failures").select("cost").gte("occurred_at", since90),
    supabase.from("orders").select("order_items(quantity, unit_cost)").neq("status", "cancelled").gte("created_at", since90),
  ]);
  if (error) throw new Error("Não foi possível carregar os pedidos.");
  const sheetMap = new Map(sheets.map((s) => [s.id, s.sheet]));

  const orders: BoardOrder[] = data.map((o) => {
    const consumed = o.consumed_at !== null || o.filament_skipped;
    return {
      id: o.id,
      number: o.number,
      status: o.status as OrderStatus,
      boardPosition: o.board_position,
      statusChangedAt: o.status_changed_at,
      dueDate: o.due_date,
      total: o.total_amount,
      customerName: o.customers?.name ?? null,
      channelName: o.sales_channels?.name ?? null,
      platformOrderNumber: o.platform_order_number,
      itemCount: o.order_items.reduce((s, i) => s + i.quantity, 0),
      printMinutes: o.order_items.reduce((s, i) => s + (i.print_minutes ?? 0), 0),
      paymentState: paymentState(toPayments(o.order_payments), o.paid_by_platform),
      consumed,
      expected: consumed ? [] : expectedFor(o.order_items, sheetMap, ctx),
    };
  });

  const failureCost = (failures ?? []).reduce((s, f) => s + f.cost, 0);
  const productionCost = (produced ?? []).reduce(
    (s, o) => s + o.order_items.reduce((t, i) => t + i.quantity * (i.unit_cost ?? 0), 0),
    0,
  );

  return {
    orders,
    spools: spoolOptions(ctx),
    queueMinutes: queueMinutes(orders),
    failure: {
      realPct: productionCost > 0 ? (failureCost / productionCost) * 100 : null,
      configuredPct: ctx.settings.failure_margin_pct,
    },
  };
}

/** Página do pedido: tudo do pedido, mais o necessário para baixa, falha e lucro. */
export async function loadOrderDetail(supabase: Supabase, id: string) {
  const [ctx, sheets, { data: o }] = await Promise.all([
    loadPricingContext(supabase),
    loadSheets(supabase),
    supabase
      .from("orders")
      .select(
        "*, customers(id, name, whatsapp), sales_channels(name, kind), quotes(id, number), order_items(*), order_payments(*), print_failures(*, filaments(material, color_name)), filament_movements(kind, grams, filaments(material, color_name))",
      )
      .eq("id", id)
      .maybeSingle(),
  ]);
  if (!o) return null;
  const sheetMap = new Map(sheets.map((s) => [s.id, s.sheet]));
  const consumed = o.consumed_at !== null || o.filament_skipped;
  return {
    order: o,
    ctx,
    spools: spoolOptions(ctx),
    paymentState: paymentState(toPayments(o.order_payments), o.paid_by_platform),
    expected: consumed ? [] : expectedFor(o.order_items, sheetMap, ctx),
  };
}
