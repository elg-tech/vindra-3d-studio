import { describe, expect, it } from "vitest";
import {
  type FinanceOrder,
  type ManualTransaction,
  breakEven,
  buildDre,
  cashTotals,
  changePct,
  currentMonth,
  dayOf,
  entriesCsv,
  entriesOfMonth,
  filamentEntries,
  lastMonths,
  manualEntries,
  monthLabel,
  receivable,
  recognitionDay,
  revenueEntries,
  shiftMonth,
  splitFees,
} from "@/lib/finance";

function order(over: Partial<FinanceOrder> = {}): FinanceOrder {
  return {
    id: "o1",
    number: "PED-2026-0001",
    status: "delivered",
    createdAt: "2026-10-05T15:00:00Z",
    total: 100,
    channelFees: 10,
    shipping: 0,
    paidByPlatform: false,
    consumedAt: "2026-10-06T12:00:00Z",
    channelName: "Venda direta",
    channelKind: "direct",
    payments: [{ kind: "full", amount: 100, paidOn: "2026-10-10" }],
    items: [
      { quantity: 2, unitPrice: 50, unitCost: 20, unitLaborCost: 5, printMinutes: 60, productKey: "p1", productName: "Vaso" },
    ],
    ...over,
  };
}

const tx = (over: Partial<ManualTransaction> = {}): ManualTransaction => ({
  id: "t1",
  kind: "expense",
  category: "other",
  description: null,
  amount: 10,
  occurredOn: "2026-10-15",
  isFixed: false,
  ...over,
});

describe("meses no fuso de São Paulo", () => {
  it("pagamento de 31/10 às 23h fica em outubro", () => {
    // 23h em São Paulo = 02h do dia 1º em UTC
    expect(dayOf("2026-11-01T02:00:00Z")).toBe("2026-10-31");
    expect(currentMonth(new Date("2026-11-01T02:00:00Z"))).toBe("2026-10");
    expect(currentMonth(new Date("2026-11-01T03:00:00Z"))).toBe("2026-11");
  });

  it("pedido de plataforma criado em 31/10 às 23h entra em outubro", () => {
    const o = order({ paidByPlatform: true, payments: [], createdAt: "2026-11-01T02:00:00Z" });
    expect(recognitionDay(o)).toBe("2026-10-31");
    expect(revenueEntries([o])[0].date).toBe("2026-10-31");
  });

  it("navega entre meses e virada de ano", () => {
    expect(shiftMonth("2026-01", -1)).toBe("2025-12");
    expect(shiftMonth("2026-12", 1)).toBe("2027-01");
    expect(lastMonths("2026-02", 3)).toEqual(["2025-12", "2026-01", "2026-02"]);
    expect(monthLabel("2026-03")).toBe("março de 2026");
  });
});

describe("rateio das taxas entre sinal e restante", () => {
  it("divide na proporção do valor", () => {
    expect(splitFees(10, [30, 70])).toEqual([3, 7]);
  });

  it("a sobra do arredondamento fica no último e a soma bate", () => {
    const shares = splitFees(10, [33.33, 66.67]);
    expect(shares).toEqual([3.33, 6.67]);
    const odd = splitFees(1, [1, 1, 1]);
    expect(odd).toEqual([0.33, 0.33, 0.34]);
  });

  it("cada pagamento recebido vira uma receita com sua parte da taxa", () => {
    const o = order({
      total: 200,
      channelFees: 9.99,
      payments: [
        { kind: "deposit", amount: 100, paidOn: "2026-10-01" },
        { kind: "balance", amount: 100, paidOn: null },
      ],
    });
    const entries = revenueEntries([o]);
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({ date: "2026-10-01", gross: 100, fee: 5, net: 95, source: "payment" });

    o.payments[1].paidOn = "2026-11-03";
    const both = revenueEntries([o]);
    expect(both.map((e) => e.fee)).toEqual([5, 4.99]);
    expect(both[1].date).toBe("2026-11-03");
  });

  it("pagamento desfeito some da receita", () => {
    const o = order({ payments: [{ kind: "full", amount: 100, paidOn: null }] });
    expect(revenueEntries([o])).toEqual([]);
  });
});

describe("lançamentos e totais", () => {
  it("carretel entra como despesa (preço + frete) na data da compra ou do cadastro", () => {
    const [a, b] = filamentEntries([
      { id: "f1", label: "PLA Preto", pricePaid: 99.9, shippingCost: 15, purchasedAt: "2026-10-02", createdAt: "2026-10-20T12:00:00Z" },
      { id: "f2", label: "PETG", pricePaid: 80, shippingCost: 0, purchasedAt: null, createdAt: "2026-11-01T01:00:00Z" },
    ]);
    expect(a).toMatchObject({ date: "2026-10-02", gross: 114.9, net: -114.9, kind: "expense" });
    expect(b.date).toBe("2026-10-31");
  });

  it("filtra o mês e soma entradas líquidas, saídas e saldo", () => {
    const entries = [
      ...revenueEntries([order()]),
      ...manualEntries([tx({ amount: 30 }), tx({ id: "t2", amount: 50, occurredOn: "2026-09-30" })]),
    ];
    const month = entriesOfMonth(entries, "2026-10");
    expect(month).toHaveLength(2);
    expect(cashTotals(month)).toEqual({ income: 90, fees: 10, expenses: 30, balance: 60 });
  });
});

describe("DRE", () => {
  const base = {
    month: "2026-10",
    failures: [{ cost: 4, occurredAt: "2026-10-12T12:00:00Z" }],
    transactions: [tx({ amount: 6 }), tx({ id: "i1", kind: "income", category: "other_income", amount: 2 })],
    taxPct: 6,
  };

  it("monta as linhas e as duas linhas de lucro", () => {
    const dre = buildDre({ ...base, orders: [order({ shipping: 10, total: 110 })] });
    expect(dre).toMatchObject({
      revenue: 110,
      fees: 10,
      tax: 6.6,
      taxSource: "rate",
      shipping: 10,
      productsCost: 40,
      failures: 4,
      grossProfit: 39.4,
      otherIncome: 2,
      expenses: 6,
      netProfit: 35.4,
      labor: 10,
      netProfitWithoutLabor: 45.4,
      orders: 1,
    });
  });

  it("pedido entra no mês em que ficou totalmente pago, com receita e custo juntos", () => {
    const split = order({
      payments: [
        { kind: "deposit", amount: 50, paidOn: "2026-09-28" },
        { kind: "balance", amount: 50, paidOn: "2026-10-02" },
      ],
    });
    expect(buildDre({ ...base, month: "2026-09", orders: [split] }).revenue).toBe(0);
    const oct = buildDre({ ...base, orders: [split] });
    expect(oct.revenue).toBe(100);
    expect(oct.productsCost).toBe(40);

    const unpaid = order({ payments: [{ kind: "full", amount: 100, paidOn: null }] });
    expect(buildDre({ ...base, orders: [unpaid] }).orders).toBe(0);
  });

  it("sem alíquota, o imposto vem dos lançamentos 'Impostos' (nunca conta duas vezes)", () => {
    const transactions = [tx({ category: "taxes", amount: 12 }), tx({ id: "t2", amount: 3 })];
    const noRate = buildDre({ ...base, transactions, taxPct: 0, orders: [order()] });
    expect(noRate).toMatchObject({ tax: 12, taxSource: "manual", expenses: 3 });
    const withRate = buildDre({ ...base, transactions, taxPct: 6, orders: [order()] });
    expect(withRate).toMatchObject({ tax: 6, taxSource: "rate", expenses: 3 });
  });

  it("cancelado depois de pago continua como receita; sem peças impressas, sem custo", () => {
    const dre = buildDre({ ...base, failures: [], transactions: [], orders: [order({ status: "cancelled", consumedAt: null })] });
    expect(dre).toMatchObject({ revenue: 100, productsCost: 0, labor: 0 });
    const estorno = buildDre({ ...base, failures: [], transactions: [tx({ category: "refund", amount: 100 })], orders: [order({ status: "cancelled", consumedAt: null })] });
    expect(estorno.netProfit).toBe(-16);
  });

  it("conta pedidos com item sem custo", () => {
    const o = order();
    o.items[0].unitCost = null;
    expect(buildDre({ ...base, orders: [o] }).ordersMissingCost).toBe(1);
  });
});

describe("ponto de equilíbrio", () => {
  it("despesas fixas ÷ margem de contribuição média", () => {
    // contribuição = 100 − 10 − 0 − 0 − 40 = 50 → 50%
    const be = breakEven({
      month: "2026-10",
      transactions: [tx({ isFixed: true, amount: 300 }), tx({ id: "t2", amount: 999 })],
      recentOrders: [order()],
      taxPct: 0,
      billed: 150,
    });
    expect(be).toMatchObject({ fixed: 300, fixedFromPreviousMonth: false, marginPct: 50, required: 600, progress: 0.25 });
  });

  it("sem fixas no mês usa as do mês anterior", () => {
    const be = breakEven({
      month: "2026-11",
      transactions: [tx({ isFixed: true, amount: 300 })],
      recentOrders: [order()],
      taxPct: 0,
      billed: 0,
    });
    expect(be).toMatchObject({ fixed: 300, fixedFromPreviousMonth: true });
  });

  it("sem pedidos ou com margem negativa não calcula", () => {
    expect(breakEven({ month: "2026-10", transactions: [], recentOrders: [], taxPct: 0, billed: 0 }).required).toBeNull();
    const loss = order({ channelFees: 90 });
    expect(breakEven({ month: "2026-10", transactions: [], recentOrders: [loss], taxPct: 0, billed: 0 }).required).toBeNull();
  });
});

describe("KPIs", () => {
  it("A receber: restantes não pagos de pedidos com sinal pago, sem cancelados", () => {
    const withDeposit = (over: Partial<FinanceOrder>) =>
      order({
        payments: [
          { kind: "deposit", amount: 40, paidOn: "2026-10-01" },
          { kind: "balance", amount: 60, paidOn: null },
        ],
        ...over,
      });
    const orders = [
      withDeposit({ id: "a" }),
      withDeposit({ id: "b", status: "cancelled" }),
      order({ id: "c", payments: [{ kind: "deposit", amount: 40, paidOn: null }, { kind: "balance", amount: 60, paidOn: null }] }),
      order({ id: "d", payments: [{ kind: "full", amount: 100, paidOn: null }] }),
    ];
    expect(receivable(orders)).toBe(60);
  });

  it("comparação com o mês anterior", () => {
    expect(changePct(150, 100)).toBe(50);
    expect(changePct(-50, -100)).toBe(50);
    expect(changePct(10, 0)).toBeNull();
  });
});

describe("CSV", () => {
  it("usa ';', vírgula decimal, BOM e mantém os acentos", () => {
    const csv = entriesCsv(manualEntries([tx({ description: 'Manutenção; bico "0,4"', amount: 1234.5, category: "parts" })]));
    expect(csv.startsWith("﻿Data;Tipo;Origem;Categoria;Descrição;Valor bruto;Taxas;Valor líquido\r\n")).toBe(true);
    expect(csv).toContain('15/10/2026;Despesa;Manual;Peças e manutenção;"Manutenção; bico ""0,4""";1234,50;0,00;-1234,50\r\n');
  });
});
