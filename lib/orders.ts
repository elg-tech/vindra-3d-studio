import { addDays, getISODay, parseISO } from "date-fns";
import { formatInTimeZone } from "date-fns-tz";
import { type ContextSpool, type PricingContext, type SheetData, matchSpool, printerCosts } from "@/lib/cost-sheet";
import { depreciationPerHour, energyCostPerHour } from "@/lib/pricing";
import { daysUntil, todayIso } from "@/lib/quotes";

// ---------------------------------------------------------------
// Status e colunas
// ---------------------------------------------------------------
export const BOARD_STATUSES = [
  "awaiting_payment",
  "queued",
  "printing",
  "post_processing",
  "ready",
  "shipped",
  "delivered",
] as const;
export type BoardStatus = (typeof BOARD_STATUSES)[number];
export type OrderStatus = BoardStatus | "cancelled";

export const ORDER_STATUS_LABEL: Record<OrderStatus, string> = {
  awaiting_payment: "Aguardando pagamento",
  queued: "Na fila",
  printing: "Imprimindo",
  post_processing: "Pós-processamento",
  ready: "Pronto",
  shipped: "Enviado",
  delivered: "Entregue",
  cancelled: "Cancelado",
};

/** Entrar nestas colunas pede a baixa do filamento (se ainda não houve). */
export const CONSUMES_FILAMENT: ReadonlySet<OrderStatus> = new Set(["printing", "post_processing", "ready", "shipped", "delivered"]);

// ---------------------------------------------------------------
// Prazo (dias úteis: segunda a sexta, sem feriados)
// ---------------------------------------------------------------
export function addBusinessDays(isoDate: string, days: number): string {
  let date = parseISO(isoDate);
  let left = days;
  while (left > 0) {
    date = addDays(date, 1);
    if (getISODay(date) <= 5) left--;
  }
  return formatInTimeZone(date, "UTC", "yyyy-MM-dd");
}

/** Prazo a partir de hoje (São Paulo). */
export function dueDateFromToday(businessDays: number, now = new Date()): string {
  return addBusinessDays(todayIso(now), businessDays);
}

// ---------------------------------------------------------------
// Consumo previsto de filamento
// ---------------------------------------------------------------
export type ConsumptionLine = {
  /** Carretel da ficha (pode ter acabado); null = média do material. */
  filamentId: string | null;
  material: string;
  colorHex: string | null;
  grams: number;
};

/**
 * Gramas que o pedido vai gastar: por item, gramas por mesa × mesas (peças ÷ peças por mesa).
 * A purga da mesa é dividida entre os filamentos na proporção dos gramas. Linhas iguais se somam.
 */
export function expectedConsumption(items: { sheet: SheetData | null; quantity: number }[]): ConsumptionLine[] {
  const lines = new Map<string, ConsumptionLine>();
  for (const { sheet, quantity } of items) {
    if (!sheet || sheet.filaments.length === 0) continue;
    const plates = quantity / sheet.piecesPerPlate;
    const plateGrams = sheet.filaments.reduce((s, f) => s + f.grams, 0);
    for (const f of sheet.filaments) {
      const purgeShare = plateGrams > 0 ? (sheet.purgeG * f.grams) / plateGrams : sheet.purgeG / sheet.filaments.length;
      const grams = (f.grams + purgeShare) * plates;
      if (grams <= 0) continue;
      const key = f.filamentId ?? `${f.material}|${f.colorHex ?? ""}`;
      const current = lines.get(key);
      if (current) current.grams += grams;
      else lines.set(key, { filamentId: f.filamentId, material: f.material, colorHex: f.colorHex, grams });
    }
  }
  return [...lines.values()].map((l) => ({ ...l, grams: Math.round(l.grams * 10) / 10 }));
}

const hasStock = (s: ContextSpool) => s.status !== "empty" && s.remaining_g > 0;

/** Carretel sugerido para a baixa: o da ficha com saldo; senão o de cor mais próxima; senão o mais cheio do material. */
export function suggestSpool(line: ConsumptionLine, spools: ContextSpool[]): ContextSpool | null {
  const own = line.filamentId ? spools.find((s) => s.id === line.filamentId) : undefined;
  if (own && hasStock(own)) return own;
  if (line.colorHex) {
    const match = matchSpool(line.material, line.colorHex, spools);
    if (match) return match;
  }
  return (
    spools.filter((s) => s.material === line.material && hasStock(s)).sort((a, b) => b.remaining_g - a.remaining_g)[0] ?? null
  );
}

/** Tempo de impressão do item (min): tempo por mesa × mesas. */
export function itemPrintMinutes(sheet: SheetData | null, quantity: number): number | null {
  if (!sheet || sheet.printMinutes <= 0) return null;
  return Math.round((sheet.printMinutes * quantity) / sheet.piecesPerPlate);
}

// ---------------------------------------------------------------
// Fila de impressão
// ---------------------------------------------------------------
export type QueueOrder = { status: OrderStatus; statusChangedAt: string; printMinutes: number };

/** Minutos de impressão pela frente: "Na fila" inteiro; "Imprimindo" menos o tempo desde a entrada na coluna. */
export function queueMinutes(orders: QueueOrder[], now = new Date()): number {
  return orders.reduce((total, o) => {
    if (o.status === "queued") return total + o.printMinutes;
    if (o.status === "printing") {
      const elapsed = (now.getTime() - new Date(o.statusChangedAt).getTime()) / 60_000;
      return total + Math.max(o.printMinutes - elapsed, 0);
    }
    return total;
  }, 0);
}

// ---------------------------------------------------------------
// Pagamento
// ---------------------------------------------------------------
export type PaymentKind = "deposit" | "balance" | "full";
export type PaymentMethod = "pix" | "cash" | "card";
export const PAYMENT_METHOD_LABEL: Record<PaymentMethod, string> = { pix: "Pix", cash: "Dinheiro", card: "Cartão" };
export const PAYMENT_KIND_LABEL: Record<PaymentKind, string> = { deposit: "Sinal", balance: "Restante", full: "Pagamento" };

export type OrderPayment = { kind: PaymentKind; amount: number; paidOn: string | null };
export type PaymentState = "platform" | "awaiting_deposit" | "awaiting_payment" | "deposit_paid" | "paid";

export const PAYMENT_STATE_LABEL: Record<PaymentState, string> = {
  platform: "Pago na plataforma",
  awaiting_deposit: "Aguardando sinal",
  awaiting_payment: "Aguardando pagamento",
  deposit_paid: "Sinal pago",
  paid: "Pago",
};

export function paymentState(payments: OrderPayment[], paidByPlatform: boolean): PaymentState {
  if (paidByPlatform) return "platform";
  if (payments.length === 0) return "awaiting_payment";
  if (payments.every((p) => p.paidOn !== null)) return "paid";
  const deposit = payments.find((p) => p.kind === "deposit");
  if (deposit) return deposit.paidOn ? "deposit_paid" : "awaiting_deposit";
  return "awaiting_payment";
}

/** Pagamentos previstos: sinal + restante quando o orçamento tem sinal; senão um só. */
export function plannedPayments(total: number, deposit: number | null): { kind: PaymentKind; amount: number }[] {
  if (deposit !== null && deposit > 0 && deposit < total) {
    return [
      { kind: "deposit", amount: deposit },
      { kind: "balance", amount: Math.round((total - deposit) * 100) / 100 },
    ];
  }
  return [{ kind: "full", amount: total }];
}

/**
 * Quanto devolver ao cliente no cancelamento: o que ele já pagou.
 * Pedido de plataforma: o que a loja recebeu (total − taxas do canal), que é o que entrou no caixa.
 */
export function refundAmount(o: { paidByPlatform: boolean; total: number; channelFees: number; payments: OrderPayment[] }): number {
  const paid = o.paidByPlatform ? o.total - o.channelFees : o.payments.reduce((s, p) => s + (p.paidOn ? p.amount : 0), 0);
  return Math.max(Math.round(paid * 100) / 100, 0);
}

/** Aviso (não bloqueio) ao mover o pedido. */
export function moveWarning(target: OrderStatus, state: PaymentState): string | null {
  if (state === "platform" || state === "paid") return null;
  if (target === "printing" && (state === "awaiting_deposit" || state === "awaiting_payment"))
    return state === "awaiting_deposit" ? "O sinal ainda não foi pago." : "O pedido ainda não foi pago.";
  if (target === "shipped" || target === "delivered")
    return state === "deposit_paid" ? "O restante ainda não foi pago." : "O pedido ainda não foi pago.";
  return null;
}

// ---------------------------------------------------------------
// Custos
// ---------------------------------------------------------------

/** Custo da máquina por hora (energia + depreciação + manutenção) da impressora padrão. */
export function machineCostPerHour(ctx: PricingContext): number {
  const printer = ctx.printers.find((p) => p.is_default) ?? ctx.printers[0];
  const p = printerCosts(printer);
  if (!p) return 0;
  const energy = p.powerWatts !== null && ctx.settings.energy_rate_kwh !== null ? energyCostPerHour(p.powerWatts, ctx.settings.energy_rate_kwh) : 0;
  const depreciation =
    p.purchasePrice !== null && p.lifetimeHours !== null && p.lifetimeHours > 0 ? depreciationPerHour(p.purchasePrice, p.lifetimeHours) : 0;
  return energy + depreciation + (p.maintenancePerHour ?? 0);
}

/** Custo da falha: filamento perdido + tempo de máquina perdido. */
export function failureCost(f: { grams: number; costPerGram: number | null; minutes: number; machinePerHour: number }): number {
  return Math.round(((f.grams * (f.costPerGram ?? 0)) + (f.minutes / 60) * f.machinePerHour) * 100) / 100;
}

export type OrderProfit = { itemsCost: number | null; tax: number; profit: number | null; marginPct: number | null };

/** Lucro = total − taxas do canal − imposto − frete − custo das peças − falhas. O frete só passa pelo caixa. */
export function orderProfit(o: {
  total: number;
  channelFees: number;
  taxPct: number;
  shipping: number;
  items: { quantity: number; unitCost: number | null }[];
  failuresCost: number;
}): OrderProfit {
  const tax = (o.total * o.taxPct) / 100;
  const missing = o.items.some((i) => i.unitCost === null);
  const itemsCost = missing ? null : o.items.reduce((s, i) => s + i.quantity * (i.unitCost ?? 0), 0);
  if (itemsCost === null) return { itemsCost, tax, profit: null, marginPct: null };
  const profit = o.total - o.channelFees - tax - o.shipping - itemsCost - o.failuresCost;
  return { itemsCost, tax, profit, marginPct: o.total > 0 ? (profit / o.total) * 100 : null };
}

/** Prazo do pedido: atrasado, vence hoje ou no prazo (null sem prazo). Pedido enviado/entregue não atrasa. */
export function dueState(dueDate: string | null, status: OrderStatus, now = new Date()): "overdue" | "today" | "ok" | null {
  if (!dueDate || status === "shipped" || status === "delivered" || status === "cancelled") return null;
  const days = daysUntil(dueDate, now);
  return days < 0 ? "overdue" : days === 0 ? "today" : "ok";
}

/** 150 → "2h30"; 45 → "45 min". */
export function formatMinutes(minutes: number): string {
  const m = Math.round(minutes);
  return m >= 60 ? `${Math.floor(m / 60)}h${m % 60 ? String(m % 60).padStart(2, "0") : ""}` : `${m} min`;
}

/** Próxima etapa do quadro ("Avançar →"); null na última. */
export function nextStatus(status: OrderStatus): BoardStatus | null {
  const index = (BOARD_STATUSES as readonly string[]).indexOf(status);
  return index >= 0 && index < BOARD_STATUSES.length - 1 ? BOARD_STATUSES[index + 1] : null;
}
