import "server-only";
import {
  type Movement,
  approvalRate,
  filamentUsage,
  gramsUsed,
  monthlySeries,
  printerHours,
  salesByChannel,
  topProducts,
} from "@/lib/dashboard";
import { isLowStock, type FilamentStatus } from "@/lib/filaments";
import { buildDre, currentMonth, receivable, shiftMonth } from "@/lib/finance";
import { loadFinance } from "@/lib/finance-loaders";
import { formatGrams } from "@/lib/format";
import { loadProductSummaries } from "@/lib/product-loaders";
import { type QuoteStatus, daysUntil, effectiveStatus } from "@/lib/quotes";
import type { createClient } from "@/lib/supabase/server";

type Supabase = Awaited<ReturnType<typeof createClient>>;

export type Alert = { id: string; tone: "danger" | "warning"; title: string; detail: string; href: string };

const OPEN_STATUSES = ["awaiting_payment", "queued", "printing", "post_processing", "ready"];

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** Dashboard do mês atual: KPIs comparados com o mês anterior, gráficos e alertas. */
export async function loadDashboard(supabase: Supabase, now = new Date()) {
  const month = currentMonth(now);
  const previous = shiftMonth(month, -1);
  // folga de um dia para o fuso: o filtro fino por mês é feito em São Paulo
  const since = `${shiftMonth(month, -1)}-01T00:00:00-03:00`;

  const [finance, quotes, openOrders, filaments, movements, products] = await Promise.all([
    loadFinance(supabase),
    supabase.from("quotes").select("id, number, status, valid_until, sent_at, customers(name), orders(id)"),
    supabase.from("orders").select("id, number, status, due_date, customers(name)").in("status", [...OPEN_STATUSES, "shipped"]),
    supabase.from("filaments").select("id, material, color_name, remaining_g, min_stock_g, status, filament_brands(name)"),
    supabase
      .from("filament_movements")
      .select("kind, grams, occurred_at, filaments(material, color_name, color_hex)")
      .in("kind", ["consumption", "failure"])
      .gte("occurred_at", since),
    loadProductSummaries(supabase),
  ]);
  if (quotes.error || openOrders.error || filaments.error || movements.error) {
    throw new Error("Não foi possível carregar o dashboard.");
  }

  const dre = buildDre({ month, ...finance });
  const previousDre = buildDre({ month: previous, ...finance });

  const moves: Movement[] = movements.data.map((m) => ({
    kind: m.kind,
    grams: m.grams,
    occurredAt: m.occurred_at,
    material: m.filaments?.material ?? "Outro",
    colorName: m.filaments?.color_name ?? "Carretel excluído",
    colorHex: m.filaments?.color_hex ?? "#888888",
  }));
  const quoteRates = quotes.data.map((q) => ({ status: q.status, sentAt: q.sent_at }));

  const kpis = {
    dre,
    previousDre,
    inProgress: openOrders.data.length,
    pendingQuotes: quotes.data.filter((q) => effectiveStatus(q.status as QuoteStatus, q.valid_until, now) === "sent").length,
    approval: { current: approvalRate(quoteRates, month), previous: approvalRate(quoteRates, previous) },
    grams: { current: gramsUsed(moves, month), previous: gramsUsed(moves, previous) },
    hours: { current: printerHours(finance.orders, finance.failures, month), previous: printerHours(finance.orders, finance.failures, previous) },
    receivable: receivable(finance.orders),
  };

  // ---------------- alertas ----------------
  const alerts: Alert[] = [];

  for (const o of openOrders.data) {
    if (!o.due_date || o.status === "shipped") continue;
    const days = daysUntil(o.due_date, now);
    if (days > 1) continue;
    const who = o.customers?.name ? ` · ${o.customers.name}` : "";
    alerts.push({
      id: `order-${o.id}`,
      tone: days < 0 ? "danger" : "warning",
      title: `Pedido ${o.number}${who}`,
      detail: days < 0 ? `Atrasado ${plural(-days, "dia", "dias")}` : days === 0 ? "Vence hoje" : "Vence amanhã",
      href: `/pedidos/${o.id}`,
    });
  }

  for (const f of filaments.data) {
    if (!isLowStock(f.remaining_g, f.min_stock_g, f.status as FilamentStatus)) continue;
    alerts.push({
      id: `spool-${f.id}`,
      tone: "warning",
      title: `${f.material} ${f.color_name}${f.filament_brands?.name ? ` (${f.filament_brands.name})` : ""}`,
      detail: `Carretel com ${formatGrams(f.remaining_g)}, abaixo do mínimo de ${formatGrams(f.min_stock_g)}`,
      href: `/filamentos/${f.id}`,
    });
  }

  for (const q of quotes.data) {
    const who = q.customers?.name ? ` · ${q.customers.name}` : "";
    if (q.status === "sent" && q.valid_until) {
      const days = daysUntil(q.valid_until, now);
      if (days >= 0 && days <= 2) {
        alerts.push({
          id: `quote-exp-${q.id}`,
          tone: "warning",
          title: `Orçamento ${q.number}${who}`,
          detail: days === 0 ? "Expira hoje" : days === 1 ? "Expira amanhã" : "Expira em 2 dias",
          href: `/orcamentos/${q.id}`,
        });
      }
    }
    if (q.status === "approved" && q.orders.length === 0) {
      alerts.push({
        id: `quote-conv-${q.id}`,
        tone: "warning",
        title: `Orçamento ${q.number}${who}`,
        detail: "Aprovado e ainda não virou pedido",
        href: `/orcamentos/${q.id}`,
      });
    }
  }

  const activeProducts = products.filter((p) => p.active);
  const badMargin = activeProducts.filter((p) => p.summary.badMargin).length;
  const noFees = activeProducts.filter((p) => p.summary.feesNotConfigured).length;
  if (badMargin > 0) {
    alerts.push({
      id: "products-margin",
      tone: "warning",
      title: plural(badMargin, "produto com margem ruim", "produtos com margem ruim"),
      detail: "Preço em prejuízo ou abaixo da margem mínima",
      href: "/produtos?filtro=margem",
    });
  }
  if (noFees > 0) {
    alerts.push({
      id: "products-fees",
      tone: "warning",
      title: plural(noFees, "produto com preço em canal sem taxas", "produtos com preço em canal sem taxas"),
      detail: "Configure as taxas do canal para a margem ser real",
      href: "/produtos?filtro=taxas",
    });
  }

  alerts.sort((a, b) => (a.tone === b.tone ? 0 : a.tone === "danger" ? -1 : 1));

  return {
    month,
    kpis,
    series: monthlySeries(finance, month),
    channels: salesByChannel(finance.orders, month),
    products: topProducts(finance.orders, month, finance.taxPct),
    usage: filamentUsage(moves, month),
    alerts,
  };
}
