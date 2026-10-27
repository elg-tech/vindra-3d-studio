import { describe, expect, it } from "vitest";
import { approvalRate, filamentUsage, gramsUsed, monthlySeries, printerHours, salesByChannel, topProducts } from "@/lib/dashboard";
import type { FinanceOrder } from "@/lib/finance";

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
    items: [{ quantity: 2, unitPrice: 50, unitCost: 20, unitLaborCost: 5, printMinutes: 90, productKey: "p1", productName: "Vaso" }],
    ...over,
  };
}

describe("dashboard", () => {
  it("série mensal termina no mês e usa o DRE", () => {
    const series = monthlySeries({ orders: [order()], failures: [], transactions: [], taxPct: 0 }, "2026-11", 3);
    expect(series.map((p) => p.month)).toEqual(["2026-09", "2026-10", "2026-11"]);
    expect(series[1]).toEqual({ month: "2026-10", revenue: 100, netProfit: 50 });
  });

  it("vendas por canal só com pedidos pagos no mês", () => {
    const shopee = order({ id: "s", paidByPlatform: true, payments: [], channelName: "Shopee", channelKind: "shopee", total: 300 });
    const unpaid = order({ id: "u", payments: [{ kind: "full", amount: 100, paidOn: null }] });
    expect(salesByChannel([order(), shopee, unpaid], "2026-10")).toEqual([
      { name: "Shopee", kind: "shopee", revenue: 300, orders: 1 },
      { name: "Venda direta", kind: "direct", revenue: 100, orders: 1 },
    ]);
  });

  it("top produtos: taxas e imposto rateados pelo valor, sem itens sem custo", () => {
    const o = order({
      total: 150,
      channelFees: 15,
      payments: [{ kind: "full", amount: 150, paidOn: "2026-10-10" }],
      items: [
        { quantity: 2, unitPrice: 50, unitCost: 20, unitLaborCost: 0, printMinutes: 0, productKey: "p1", productName: "Vaso" },
        { quantity: 1, unitPrice: 50, unitCost: null, unitLaborCost: null, printMinutes: 0, productKey: "p2", productName: "Chaveiro" },
      ],
    });
    // vaso: 100 − 10 (taxa) − 6 (imposto) − 40 = 44
    expect(topProducts([o], "2026-10", 6)).toEqual([{ key: "p1", name: "Vaso", quantity: 2, profit: 44 }]);
  });

  it("gramas e consumo por cor, com baixas e falhas no fuso de São Paulo", () => {
    const movements = [
      { kind: "consumption", grams: -120, occurredAt: "2026-10-10T12:00:00Z", material: "PLA", colorName: "Preto", colorHex: "#000000" },
      { kind: "failure", grams: -30, occurredAt: "2026-11-01T02:00:00Z", material: "PLA", colorName: "preto ", colorHex: "#000000" },
      { kind: "purchase", grams: 1000, occurredAt: "2026-10-10T12:00:00Z", material: "PLA", colorName: "Preto", colorHex: "#000000" },
    ];
    expect(gramsUsed(movements, "2026-10")).toBe(150);
    expect(filamentUsage(movements, "2026-10")).toEqual([{ material: "PLA", colorName: "Preto", colorHex: "#000000", grams: 150 }]);
  });

  it("horas de impressora: pedidos baixados no mês + falhas", () => {
    expect(printerHours([order()], [{ minutes: 30, occurredAt: "2026-10-20T12:00:00Z" }], "2026-10")).toBe(2);
  });

  it("taxa de aprovação dos orçamentos enviados no mês", () => {
    const quotes = [
      { status: "approved", sentAt: "2026-10-02T12:00:00Z" },
      { status: "sent", sentAt: "2026-10-03T12:00:00Z" },
      { status: "rejected", sentAt: "2026-10-04T12:00:00Z" },
      { status: "approved", sentAt: "2026-10-05T12:00:00Z" },
      { status: "draft", sentAt: null },
    ];
    expect(approvalRate(quotes, "2026-10")).toBe(50);
    expect(approvalRate(quotes, "2026-09")).toBeNull();
  });
});
