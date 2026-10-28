import { addMonths, parseISO } from "date-fns";
import { formatInTimeZone } from "date-fns-tz";
import { TIME_ZONE } from "@/lib/format";
import type { OrderStatus, PaymentKind } from "@/lib/orders";
import { PAYMENT_KIND_LABEL } from "@/lib/orders";
import { todayIso } from "@/lib/quotes";

/**
 * Financeiro: fluxo de caixa, DRE do mês, ponto de equilíbrio e "A receber".
 * Funções puras, cobertas por testes em tests/finance.test.ts.
 *
 * Receitas e compras de carretel são montadas na hora a partir dos pagamentos e dos carretéis
 * (não são copiadas para `transactions`, que guarda só os lançamentos manuais).
 */

const round2 = (n: number) => Math.round(n * 100) / 100;

// ---------------------------------------------------------------
// Meses (fuso de São Paulo)
// ---------------------------------------------------------------

/** "2026-10" */
export type Month = string;

export const isMonth = (value: string | undefined): value is Month => !!value && /^\d{4}-(0[1-9]|1[0-2])$/.test(value);

export const currentMonth = (now = new Date()): Month => todayIso(now).slice(0, 7);

/** Mês de um dia "2026-10-31". */
export const monthOfDay = (isoDate: string): Month => isoDate.slice(0, 7);

/** Dia (São Paulo) de um instante: 31/10 às 23h em São Paulo continua em 31/10. */
export const dayOf = (timestamp: string | Date): string => formatInTimeZone(new Date(timestamp), TIME_ZONE, "yyyy-MM-dd");

export function shiftMonth(month: Month, delta: number): Month {
  return formatInTimeZone(addMonths(parseISO(`${month}-01T12:00:00Z`), delta), "UTC", "yyyy-MM");
}

/** Os `count` meses que terminam em `month`, do mais antigo ao mais novo. */
export function lastMonths(month: Month, count: number): Month[] {
  return Array.from({ length: count }, (_, i) => shiftMonth(month, i - count + 1));
}

const MONTH_NAMES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];

/** "2026-10" → "outubro de 2026" */
export function monthLabel(month: Month): string {
  const [y, m] = month.split("-");
  return `${MONTH_NAMES[Number(m) - 1]} de ${y}`;
}

/** "2026-10" → "Outubro de 2026" (título) */
export function monthTitle(month: Month): string {
  const label = monthLabel(month);
  return label.charAt(0).toUpperCase() + label.slice(1);
}

/** "2026-10" → "out/26" */
export function monthShortLabel(month: Month): string {
  const [y, m] = month.split("-");
  return `${MONTH_NAMES[Number(m) - 1].slice(0, 3)}/${y.slice(2)}`;
}

// ---------------------------------------------------------------
// Categorias dos lançamentos manuais
// ---------------------------------------------------------------
export const EXPENSE_CATEGORIES = {
  parts: "Peças e manutenção",
  tools: "Ferramentas",
  packaging: "Embalagens",
  ads: "Anúncios",
  software: "Software e assinaturas",
  shipping: "Frete",
  taxes: "Impostos",
  refund: "Estorno",
  other: "Outros",
} as const;
export const INCOME_CATEGORIES = { other_income: "Outras receitas" } as const;

export type ExpenseCategory = keyof typeof EXPENSE_CATEGORIES;
export type IncomeCategory = keyof typeof INCOME_CATEGORIES;
export type ManualCategory = ExpenseCategory | IncomeCategory;

export const CATEGORY_LABEL: Record<string, string> = { ...EXPENSE_CATEGORIES, ...INCOME_CATEGORIES };

// ---------------------------------------------------------------
// Entradas
// ---------------------------------------------------------------
export type FinanceItem = {
  quantity: number;
  unitPrice: number;
  /** Custo por peça (inclui a hora de trabalho); null = sem custo conhecido. */
  unitCost: number | null;
  /** Parte do custo por peça que é hora de trabalho (preparo e pós). */
  unitLaborCost: number | null;
  printMinutes: number | null;
  /** Produto (ou a descrição, em item avulso). */
  productKey: string;
  productName: string;
};

export type FinanceOrder = {
  id: string;
  number: string;
  status: OrderStatus;
  createdAt: string;
  total: number;
  channelFees: number;
  shipping: number;
  paidByPlatform: boolean;
  /** Quando o filamento foi baixado (as peças foram impressas); null = sem baixa. */
  consumedAt: string | null;
  channelName: string | null;
  channelKind: string | null;
  payments: { kind: PaymentKind; amount: number; paidOn: string | null }[];
  items: FinanceItem[];
};

export type FinanceSpool = {
  id: string;
  label: string;
  pricePaid: number;
  shippingCost: number;
  purchasedAt: string | null;
  createdAt: string;
};

export type ManualTransaction = {
  id: string;
  kind: "income" | "expense";
  category: string;
  description: string | null;
  amount: number;
  occurredOn: string;
  isFixed: boolean;
  /** Pedido de origem (estorno lançado ao cancelar). */
  orderId?: string | null;
};

export type FailureCost = { cost: number; occurredAt: string };

// ---------------------------------------------------------------
// Fluxo de caixa: lançamentos do mês
// ---------------------------------------------------------------
export type EntrySource = "payment" | "platform" | "filament" | "manual";

export type FinanceEntry = {
  id: string;
  date: string;
  kind: "income" | "expense";
  source: EntrySource;
  category: string;
  description: string;
  /** Valor recebido ou pago. */
  gross: number;
  /** Taxas do canal descontadas (só receitas). */
  fee: number;
  /** Receita: bruto − taxas. Despesa: o valor pago, negativo. */
  net: number;
  href: string | null;
  /** Lançamento manual (editável aqui); os outros se editam na origem. */
  manual?: ManualTransaction;
};

/**
 * Taxas do canal divididas entre os pagamentos na proporção do valor.
 * O último pagamento fica com a sobra do arredondamento, para a soma bater com a taxa do pedido.
 */
export function splitFees(fees: number, amounts: number[]): number[] {
  const total = amounts.reduce((s, a) => s + a, 0);
  if (amounts.length === 0) return [];
  if (total <= 0) return amounts.map((_, i) => (i === amounts.length - 1 ? round2(fees) : 0));
  const shares = amounts.map((a) => round2((fees * a) / total));
  shares[shares.length - 1] = round2(fees - shares.slice(0, -1).reduce((s, x) => s + x, 0));
  return shares;
}

/** Uma receita por pagamento recebido; pedido de plataforma, uma pelo total na data do pedido. */
export function revenueEntries(orders: FinanceOrder[]): FinanceEntry[] {
  const entries: FinanceEntry[] = [];
  for (const o of orders) {
    const who = o.channelName ? ` · ${o.channelName}` : "";
    if (o.paidByPlatform) {
      entries.push({
        id: `platform-${o.id}`,
        date: dayOf(o.createdAt),
        kind: "income",
        source: "platform",
        category: "Venda",
        description: `Pedido ${o.number}${who}`,
        gross: o.total,
        fee: o.channelFees,
        net: round2(o.total - o.channelFees),
        href: `/pedidos/${o.id}`,
      });
      continue;
    }
    const fees = splitFees(
      o.channelFees,
      o.payments.map((p) => p.amount),
    );
    o.payments.forEach((p, i) => {
      if (!p.paidOn) return;
      entries.push({
        id: `payment-${o.id}-${p.kind}`,
        date: p.paidOn,
        kind: "income",
        source: "payment",
        category: "Venda",
        description: `${PAYMENT_KIND_LABEL[p.kind]} do pedido ${o.number}${who}`,
        gross: p.amount,
        fee: fees[i],
        net: round2(p.amount - fees[i]),
        href: `/pedidos/${o.id}`,
      });
    });
  }
  return entries;
}

/** Cada carretel comprado (preço + frete), na data da compra (ou do cadastro, sem data). */
export function filamentEntries(spools: FinanceSpool[]): FinanceEntry[] {
  return spools.map((s) => {
    const gross = round2(s.pricePaid + s.shippingCost);
    return {
      id: `filament-${s.id}`,
      date: s.purchasedAt ?? dayOf(s.createdAt),
      kind: "expense",
      source: "filament",
      category: "Filamento",
      description: `Carretel ${s.label}`,
      gross,
      fee: 0,
      net: -gross,
      href: `/filamentos/${s.id}`,
    };
  });
}

export function manualEntries(transactions: ManualTransaction[]): FinanceEntry[] {
  return transactions.map((t) => ({
    id: `manual-${t.id}`,
    date: t.occurredOn,
    kind: t.kind,
    source: "manual",
    category: CATEGORY_LABEL[t.category] ?? t.category,
    description: t.description ?? CATEGORY_LABEL[t.category] ?? "",
    gross: t.amount,
    fee: 0,
    net: t.kind === "income" ? t.amount : -t.amount,
    href: t.orderId ? `/pedidos/${t.orderId}` : null,
    manual: t,
  }));
}

/** Todos os lançamentos do caixa: pagamentos, carretéis e manuais. */
export const cashEntries = (d: { orders: FinanceOrder[]; spools: FinanceSpool[]; transactions: ManualTransaction[] }) => [
  ...revenueEntries(d.orders),
  ...filamentEntries(d.spools),
  ...manualEntries(d.transactions),
];

/** Lançamentos do mês, do mais recente ao mais antigo. */
export function entriesOfMonth(entries: FinanceEntry[], month: Month): FinanceEntry[] {
  return entries
    .filter((e) => monthOfDay(e.date) === month)
    .sort((a, b) => b.date.localeCompare(a.date) || a.description.localeCompare(b.description));
}

export type CashTotals = { income: number; fees: number; expenses: number; balance: number };

/** Entradas líquidas das taxas, saídas e saldo. */
export function cashTotals(entries: FinanceEntry[]): CashTotals {
  const income = round2(entries.filter((e) => e.kind === "income").reduce((s, e) => s + e.net, 0));
  const fees = round2(entries.reduce((s, e) => s + e.fee, 0));
  const expenses = round2(entries.filter((e) => e.kind === "expense").reduce((s, e) => s + e.gross, 0));
  return { income, fees, expenses, balance: round2(income - expenses) };
}

// ---------------------------------------------------------------
// DRE
// ---------------------------------------------------------------

/**
 * Dia em que o pedido entra no DRE: o do último pagamento, quando ficou totalmente pago.
 * Pedido de plataforma: o dia em que foi criado. null = ainda não pago por inteiro.
 */
export function recognitionDay(o: FinanceOrder): string | null {
  if (o.paidByPlatform) return dayOf(o.createdAt);
  if (o.payments.length === 0 || o.payments.some((p) => !p.paidOn)) return null;
  return o.payments.reduce((max, p) => ((p.paidOn as string) > max ? (p.paidOn as string) : max), "");
}

export type OrderResult = {
  revenue: number;
  fees: number;
  tax: number;
  shipping: number;
  productsCost: number;
  labor: number;
  /** Algum item sem custo conhecido (contado como R$ 0). */
  missingCost: boolean;
  /** Receita − taxas − imposto − frete − custo dos produtos. */
  contribution: number;
};

/** Resultado de um pedido. Cancelado sem peças impressas não tem custo de produção. */
export function orderResult(o: FinanceOrder, taxPct: number): OrderResult {
  const produced = o.status !== "cancelled" || o.consumedAt !== null;
  const productsCost = produced ? o.items.reduce((s, i) => s + i.quantity * (i.unitCost ?? 0), 0) : 0;
  const labor = produced ? o.items.reduce((s, i) => s + i.quantity * (i.unitLaborCost ?? 0), 0) : 0;
  const tax = (o.total * taxPct) / 100;
  return {
    revenue: o.total,
    fees: o.channelFees,
    tax,
    shipping: o.shipping,
    productsCost,
    labor,
    missingCost: produced && o.items.some((i) => i.unitCost === null),
    contribution: o.total - o.channelFees - tax - o.shipping - productsCost,
  };
}

export type Dre = {
  /** Faturamento bruto: total dos pedidos que ficaram pagos no mês (inclui o frete cobrado). */
  revenue: number;
  fees: number;
  tax: number;
  /** De onde veio o imposto: alíquota das Configurações ou lançamentos "Impostos". */
  taxSource: "rate" | "manual";
  /** Frete cobrado nos pedidos e repassado. */
  shipping: number;
  productsCost: number;
  failures: number;
  grossProfit: number;
  otherIncome: number;
  /** Despesas manuais (sem "Impostos", que estão na linha do imposto). */
  expenses: number;
  netProfit: number;
  /** Hora de trabalho contida no custo dos produtos. */
  labor: number;
  netProfitWithoutLabor: number;
  orders: number;
  ordersMissingCost: number;
};

/**
 * DRE do mês: faturamento − taxas − imposto − frete − custo dos produtos − falhas = lucro bruto;
 * + outras receitas − despesas manuais = lucro líquido. Compras de carretel ficam fora: o filamento
 * já está no custo dos produtos. Imposto: pela alíquota das Configurações; sem alíquota, pelos
 * lançamentos "Impostos" (assim eles nunca contam duas vezes).
 */
export function buildDre(input: {
  month: Month;
  orders: FinanceOrder[];
  failures: FailureCost[];
  transactions: ManualTransaction[];
  taxPct: number;
}): Dre {
  const { month, taxPct } = input;
  const results = input.orders
    .filter((o) => {
      const day = recognitionDay(o);
      return day !== null && monthOfDay(day) === month;
    })
    .map((o) => orderResult(o, taxPct));
  const sum = (pick: (r: OrderResult) => number) => results.reduce((s, r) => s + pick(r), 0);

  const manual = input.transactions.filter((t) => monthOfDay(t.occurredOn) === month);
  const manualTaxes = manual.filter((t) => t.kind === "expense" && t.category === "taxes").reduce((s, t) => s + t.amount, 0);
  const taxSource = taxPct > 0 ? "rate" : "manual";

  const revenue = round2(sum((r) => r.revenue));
  const fees = round2(sum((r) => r.fees));
  const tax = round2(taxSource === "rate" ? sum((r) => r.tax) : manualTaxes);
  const shipping = round2(sum((r) => r.shipping));
  const productsCost = round2(sum((r) => r.productsCost));
  const failures = round2(input.failures.filter((f) => monthOfDay(dayOf(f.occurredAt)) === month).reduce((s, f) => s + f.cost, 0));
  const grossProfit = round2(revenue - fees - tax - shipping - productsCost - failures);
  const otherIncome = round2(manual.filter((t) => t.kind === "income").reduce((s, t) => s + t.amount, 0));
  const expenses = round2(manual.filter((t) => t.kind === "expense" && t.category !== "taxes").reduce((s, t) => s + t.amount, 0));
  const netProfit = round2(grossProfit + otherIncome - expenses);
  const labor = round2(sum((r) => r.labor));

  return {
    revenue,
    fees,
    tax,
    taxSource,
    shipping,
    productsCost,
    failures,
    grossProfit,
    otherIncome,
    expenses,
    netProfit,
    labor,
    netProfitWithoutLabor: round2(netProfit + labor),
    orders: results.length,
    ordersMissingCost: results.filter((r) => r.missingCost).length,
  };
}

/** Custos do DRE (tudo o que sai do faturamento e das outras receitas até o lucro líquido). */
export const dreCosts = (d: Dre) => round2(d.revenue + d.otherIncome - d.netProfit);

/** Lucro líquido ÷ faturamento, em pontos; null sem faturamento. */
export const dreMarginPct = (d: Dre) => (d.revenue > 0 ? (d.netProfit / d.revenue) * 100 : null);

// ---------------------------------------------------------------
// Ponto de equilíbrio
// ---------------------------------------------------------------
export type BreakEven = {
  /** Despesas fixas consideradas. */
  fixed: number;
  /** As fixas vieram do mês anterior (o mês ainda não tem nenhuma lançada). */
  fixedFromPreviousMonth: boolean;
  /** Margem de contribuição média dos pedidos dos últimos 90 dias, em pontos. null = sem pedidos. */
  marginPct: number | null;
  /** Faturamento necessário no mês; null quando não dá para calcular (sem margem ou margem ≤ 0). */
  required: number | null;
  /** Faturado no mês (DRE). */
  billed: number;
  /** Faturado ÷ necessário, de 0 a 1. */
  progress: number | null;
};

/** Despesas fixas do mês ÷ margem de contribuição média = faturamento necessário. */
export function breakEven(input: {
  month: Month;
  transactions: ManualTransaction[];
  /** Pedidos já filtrados: pagos nos últimos 90 dias. */
  recentOrders: FinanceOrder[];
  taxPct: number;
  billed: number;
}): BreakEven {
  const fixedOf = (m: Month) =>
    input.transactions
      .filter((t) => t.kind === "expense" && t.isFixed && monthOfDay(t.occurredOn) === m)
      .reduce((s, t) => s + t.amount, 0);
  let fixed = fixedOf(input.month);
  let fixedFromPreviousMonth = false;
  if (fixed === 0) {
    fixed = fixedOf(shiftMonth(input.month, -1));
    fixedFromPreviousMonth = fixed > 0;
  }

  const results = input.recentOrders.map((o) => orderResult(o, input.taxPct));
  const revenue = results.reduce((s, r) => s + r.revenue, 0);
  const contribution = results.reduce((s, r) => s + r.contribution, 0);
  const marginPct = revenue > 0 ? (contribution / revenue) * 100 : null;
  const required = marginPct !== null && marginPct > 0 ? round2(fixed / (marginPct / 100)) : null;
  const progress = required === null ? null : required === 0 ? 1 : Math.min(input.billed / required, 1);

  return { fixed: round2(fixed), fixedFromPreviousMonth, marginPct, required, billed: input.billed, progress };
}

/** Pedidos que ficaram pagos entre `days` dias atrás e hoje. */
export function ordersPaidSince(orders: FinanceOrder[], days: number, now = new Date()): FinanceOrder[] {
  const today = todayIso(now);
  const since = todayIso(new Date(now.getTime() - days * 86_400_000));
  return orders.filter((o) => {
    const day = recognitionDay(o);
    return day !== null && day >= since && day <= today;
  });
}

// ---------------------------------------------------------------
// A receber
// ---------------------------------------------------------------

/** Restantes ainda não pagos de pedidos com sinal pago (pedidos não cancelados). */
export function receivable(orders: FinanceOrder[]): number {
  return round2(
    orders
      .filter((o) => o.status !== "cancelled" && !o.paidByPlatform)
      .filter((o) => o.payments.some((p) => p.kind === "deposit" && p.paidOn))
      .flatMap((o) => o.payments.filter((p) => p.kind === "balance" && !p.paidOn))
      .reduce((s, p) => s + p.amount, 0),
  );
}

// ---------------------------------------------------------------
// Comparação com o mês anterior
// ---------------------------------------------------------------

/** Variação percentual; null quando o anterior é 0 (não dá para comparar). */
export function changePct(current: number, previous: number): number | null {
  if (previous === 0) return null;
  return ((current - previous) / Math.abs(previous)) * 100;
}

// ---------------------------------------------------------------
// CSV (Excel em português: ";" e vírgula decimal)
// ---------------------------------------------------------------
const SOURCE_LABEL: Record<EntrySource, string> = {
  payment: "Pedido",
  platform: "Pedido (plataforma)",
  filament: "Carretel",
  manual: "Manual",
};

const csvNumber = (n: number) => n.toFixed(2).replace(".", ",");

function csvCell(value: string): string {
  return /[;"\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

/** CSV com BOM (o Excel reconhece o UTF-8 e mantém os acentos). */
export function entriesCsv(entries: FinanceEntry[]): string {
  const header = ["Data", "Tipo", "Origem", "Categoria", "Descrição", "Valor bruto", "Taxas", "Valor líquido"];
  const rows = entries.map((e) => {
    const [y, m, d] = e.date.split("-");
    return [
      `${d}/${m}/${y}`,
      e.kind === "income" ? "Receita" : "Despesa",
      SOURCE_LABEL[e.source],
      e.category,
      e.description,
      csvNumber(e.gross),
      csvNumber(e.fee),
      csvNumber(e.net),
    ];
  });
  return `﻿${[header, ...rows].map((r) => r.map(csvCell).join(";")).join("\r\n")}\r\n`;
}
