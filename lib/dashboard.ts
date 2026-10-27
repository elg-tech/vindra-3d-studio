import {
  type FailureCost,
  type FinanceOrder,
  type ManualTransaction,
  type Month,
  buildDre,
  dayOf,
  lastMonths,
  monthOfDay,
  recognitionDay,
} from "@/lib/finance";

/**
 * Contas do Dashboard. Funções puras, cobertas por testes em tests/dashboard.test.ts.
 * Os números de dinheiro vêm do DRE (lib/finance.ts), para o painel e o Financeiro baterem.
 */

const round2 = (n: number) => Math.round(n * 100) / 100;

const paidInMonth = (orders: FinanceOrder[], month: Month) =>
  orders.filter((o) => {
    const day = recognitionDay(o);
    return day !== null && monthOfDay(day) === month;
  });

// ---------------------------------------------------------------
// Faturamento x lucro dos últimos meses
// ---------------------------------------------------------------
export type MonthPoint = { month: Month; revenue: number; netProfit: number };

export function monthlySeries(
  data: { orders: FinanceOrder[]; failures: FailureCost[]; transactions: ManualTransaction[]; taxPct: number },
  month: Month,
  count = 12,
): MonthPoint[] {
  return lastMonths(month, count).map((m) => {
    const dre = buildDre({ month: m, ...data });
    return { month: m, revenue: dre.revenue, netProfit: dre.netProfit };
  });
}

// ---------------------------------------------------------------
// Vendas por canal
// ---------------------------------------------------------------
export type ChannelSales = { name: string; kind: string; revenue: number; orders: number };

/** Faturamento dos pedidos pagos no mês, por canal (maior primeiro). */
export function salesByChannel(orders: FinanceOrder[], month: Month): ChannelSales[] {
  const map = new Map<string, ChannelSales>();
  for (const o of paidInMonth(orders, month)) {
    const name = o.channelName ?? "Sem canal";
    const current = map.get(name) ?? { name, kind: o.channelKind ?? "other", revenue: 0, orders: 0 };
    current.revenue += o.total;
    current.orders += 1;
    map.set(name, current);
  }
  return [...map.values()].map((c) => ({ ...c, revenue: round2(c.revenue) })).sort((a, b) => b.revenue - a.revenue);
}

/** Cor fixa por canal (decisão da Fase 6): venda direta, Shopee, TikTok; outros canais, magenta. */
export function channelColor(kind: string): string {
  if (kind === "direct") return "var(--chart-1)";
  if (kind === "shopee") return "var(--chart-2)";
  if (kind === "tiktok") return "var(--chart-3)";
  return "var(--chart-4)";
}

// ---------------------------------------------------------------
// Top produtos por lucro
// ---------------------------------------------------------------
export type ProductProfit = { key: string; name: string; quantity: number; profit: number };

/**
 * Lucro por produto nos pedidos pagos no mês: preço − parte das taxas e do imposto − custo.
 * Taxas e imposto do pedido são divididos entre os itens na proporção do valor; o frete fica fora.
 * Itens sem custo conhecido ficam de fora (o lucro deles seria inventado).
 */
export function topProducts(orders: FinanceOrder[], month: Month, taxPct: number, limit = 5): ProductProfit[] {
  const map = new Map<string, ProductProfit>();
  for (const o of paidInMonth(orders, month)) {
    const subtotal = o.items.reduce((s, i) => s + i.quantity * i.unitPrice, 0);
    if (subtotal <= 0) continue;
    const feeRate = o.channelFees / subtotal;
    for (const i of o.items) {
      if (i.unitCost === null) continue;
      const value = i.quantity * i.unitPrice;
      const profit = value - value * feeRate - (value * taxPct) / 100 - i.quantity * i.unitCost;
      const current = map.get(i.productKey) ?? { key: i.productKey, name: i.productName, quantity: 0, profit: 0 };
      current.quantity += i.quantity;
      current.profit += profit;
      map.set(i.productKey, current);
    }
  }
  return [...map.values()]
    .map((p) => ({ ...p, profit: round2(p.profit) }))
    .sort((a, b) => b.profit - a.profit)
    .slice(0, limit);
}

// ---------------------------------------------------------------
// Filamento e impressora
// ---------------------------------------------------------------
export type Movement = {
  kind: string;
  grams: number;
  occurredAt: string;
  material: string;
  colorName: string;
  colorHex: string;
};

const usedInMonth = (movements: Movement[], month: Month) =>
  movements.filter((m) => (m.kind === "consumption" || m.kind === "failure") && monthOfDay(dayOf(m.occurredAt)) === month);

/** Gramas gastos no mês (baixas dos pedidos e perdas por falha). */
export function gramsUsed(movements: Movement[], month: Month): number {
  return Math.round(usedInMonth(movements, month).reduce((s, m) => s + Math.abs(m.grams), 0));
}

export type FilamentUsage = { material: string; colorName: string; colorHex: string; grams: number };

/** Consumo do mês por material e cor (maior primeiro). */
export function filamentUsage(movements: Movement[], month: Month): FilamentUsage[] {
  const map = new Map<string, FilamentUsage>();
  for (const m of usedInMonth(movements, month)) {
    const key = `${m.material}|${m.colorName.trim().toLowerCase()}`;
    const current = map.get(key) ?? { material: m.material, colorName: m.colorName, colorHex: m.colorHex, grams: 0 };
    current.grams += Math.abs(m.grams);
    map.set(key, current);
  }
  return [...map.values()].map((u) => ({ ...u, grams: Math.round(u.grams) })).sort((a, b) => b.grams - a.grams);
}

/** Horas de impressora no mês: tempo dos pedidos baixados no mês + tempo perdido em falhas. */
export function printerHours(orders: FinanceOrder[], failures: { minutes: number; occurredAt: string }[], month: Month): number {
  const ordersMinutes = orders
    .filter((o) => o.consumedAt !== null && monthOfDay(dayOf(o.consumedAt)) === month)
    .reduce((s, o) => s + o.items.reduce((t, i) => t + (i.printMinutes ?? 0), 0), 0);
  const failureMinutes = failures.filter((f) => monthOfDay(dayOf(f.occurredAt)) === month).reduce((s, f) => s + f.minutes, 0);
  return Math.round(((ordersMinutes + failureMinutes) / 60) * 10) / 10;
}

// ---------------------------------------------------------------
// Orçamentos
// ---------------------------------------------------------------
export type QuoteForRate = { status: string; sentAt: string | null };

/** Dos orçamentos enviados no mês, quantos foram aprovados (em pontos). null = nenhum enviado. */
export function approvalRate(quotes: QuoteForRate[], month: Month): number | null {
  const sent = quotes.filter((q) => q.sentAt !== null && monthOfDay(dayOf(q.sentAt)) === month);
  if (sent.length === 0) return null;
  return (sent.filter((q) => q.status === "approved").length / sent.length) * 100;
}
