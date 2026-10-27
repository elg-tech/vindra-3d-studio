import { addDays, differenceInCalendarDays, parseISO } from "date-fns";
import { formatInTimeZone } from "date-fns-tz";
import { TIME_ZONE, formatCurrency } from "@/lib/format";
import { type ChannelFees, profitAtPrice } from "@/lib/pricing";

export const QUOTE_STATUSES = ["draft", "sent", "approved", "rejected", "expired"] as const;
export type QuoteStatus = (typeof QUOTE_STATUSES)[number];

export const QUOTE_STATUS_LABEL: Record<QuoteStatus, string> = {
  draft: "Rascunho",
  sent: "Enviado",
  approved: "Aprovado",
  rejected: "Recusado",
  expired: "Expirado",
};

export type DiscountType = "amount" | "percent";

const cents = (n: number) => Math.round(n * 100) / 100;

// ---------------------------------------------------------------
// Datas (só dia, sem hora: "2026-11-02")
// ---------------------------------------------------------------

/** Hoje no fuso de São Paulo, como "yyyy-MM-dd". */
export function todayIso(now = new Date()): string {
  return formatInTimeZone(now, TIME_ZONE, "yyyy-MM-dd");
}

/** Validade padrão: hoje + dias das Configurações. */
export function defaultValidUntil(days: number, now = new Date()): string {
  return formatInTimeZone(addDays(parseISO(todayIso(now)), days), "UTC", "yyyy-MM-dd");
}

/** "2026-11-02" → "02/11/2026" (sem passar por fuso: é só um dia). */
export function formatDay(isoDate: string): string {
  const [y, m, d] = isoDate.slice(0, 10).split("-");
  return `${d}/${m}/${y}`;
}

/** Dias até o fim da validade (0 = vence hoje, negativo = venceu). */
export function daysUntil(isoDate: string, now = new Date()): number {
  return differenceInCalendarDays(parseISO(isoDate), parseISO(todayIso(now)));
}

/** Enviado com validade vencida aparece como expirado (sem tarefa agendada). */
export function effectiveStatus(status: QuoteStatus, validUntil: string | null, now = new Date()): QuoteStatus {
  return status === "sent" && validUntil !== null && daysUntil(validUntil, now) < 0 ? "expired" : status;
}

// ---------------------------------------------------------------
// Totais
// ---------------------------------------------------------------

export type QuoteItemAmounts = { quantity: number; unitPrice: number; unitCost?: number | null };

export type QuoteAmounts = {
  items: QuoteItemAmounts[];
  discountType: DiscountType;
  discountValue: number;
  shippingCost: number;
  /** Sinal em % do total; null = sem sinal. */
  depositPct: number | null;
};

export type QuoteTotals = {
  subtotal: number;
  /** Desconto em R$, nunca maior que o subtotal. */
  discount: number;
  shipping: number;
  total: number;
  /** Valor do sinal; null sem sinal. */
  deposit: number | null;
  /** O que o Pix cobra: o sinal, se houver, senão o total. */
  pixAmount: number;
};

export function quoteTotals(q: QuoteAmounts): QuoteTotals {
  const subtotal = cents(q.items.reduce((s, i) => s + i.quantity * i.unitPrice, 0));
  const rawDiscount = q.discountType === "percent" ? (subtotal * q.discountValue) / 100 : q.discountValue;
  const discount = cents(Math.min(Math.max(rawDiscount, 0), subtotal));
  const shipping = cents(Math.max(q.shippingCost, 0));
  const total = cents(subtotal - discount + shipping);
  const deposit = q.depositPct ? cents((total * q.depositPct) / 100) : null;
  return { subtotal, discount, shipping, total, deposit, pixAmount: deposit ?? total };
}

export type QuoteProfit = {
  /** Custo das peças (Σ custo × quantidade); null se algum item não tem custo. */
  itemsCost: number | null;
  channelFees: number;
  tax: number;
  /** Lucro = total − taxas − imposto − frete − custo das peças. O frete só passa pelo caixa. */
  profit: number | null;
  marginPct: number | null;
};

/** Lucro do orçamento com as taxas do canal de venda direta (Pix/maquininha) e o imposto. Só no painel. */
export function quoteProfit(q: QuoteAmounts, fees: ChannelFees, taxPct: number): QuoteProfit {
  const totals = quoteTotals(q);
  const missingCost = q.items.some((i) => i.unitCost === null || i.unitCost === undefined);
  const itemsCost = missingCost ? null : q.items.reduce((s, i) => s + i.quantity * (i.unitCost ?? 0), 0);
  const base = profitAtPrice(totals.total, (itemsCost ?? 0) + totals.shipping, fees, taxPct);
  return {
    itemsCost,
    channelFees: base.channelFees,
    tax: base.tax,
    profit: itemsCost === null ? null : base.profit,
    marginPct: itemsCost === null ? null : base.marginPct,
  };
}

// ---------------------------------------------------------------
// WhatsApp
// ---------------------------------------------------------------

/** Só os dígitos com o 55 do Brasil na frente; null se não parecer um celular/telefone com DDD. */
export function whatsappNumber(raw: string | null): string | null {
  const digits = (raw ?? "").replace(/\D/g, "");
  const local = digits.length >= 12 && digits.startsWith("55") ? digits.slice(2) : digits;
  return local.length === 10 || local.length === 11 ? `55${local}` : null;
}

/** wa.me com a mensagem pronta; sem número abre a escolha de contato. */
export function whatsappLink(raw: string | null, text: string): string {
  const number = whatsappNumber(raw);
  return `https://wa.me/${number ?? ""}?text=${encodeURIComponent(text)}`;
}

export function quoteMessage(m: {
  customerName: string | null;
  storeName: string;
  number: string;
  total: number;
  validUntil: string | null;
  link: string;
}): string {
  const firstName = m.customerName?.trim().split(/\s+/)[0];
  return [
    `Olá${firstName ? `, ${firstName}` : ""}! Aqui é da ${m.storeName}.`,
    `Segue o orçamento ${m.number}, no total de ${formatCurrency(m.total)}.`,
    m.validUntil ? `Válido até ${formatDay(m.validUntil)}.` : null,
    "",
    `Veja os detalhes e aprove por aqui: ${m.link}`,
  ]
    .filter((line) => line !== null)
    .join("\n");
}
