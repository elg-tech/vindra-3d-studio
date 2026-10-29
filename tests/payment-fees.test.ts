import { describe, expect, it } from "vitest";
import { paymentFees } from "@/lib/finance";
import { profitAtPrice } from "@/lib/pricing";
import { type PaymentRates, methodChannelFees, orderPaymentFees, paymentFee, paymentRates, rateLabel } from "@/lib/payment-fees";

const rates: PaymentRates = {
  pix: { pct: 0, fixed: 0 },
  cash: { pct: 0, fixed: 0 },
  debit: { pct: 1.99, fixed: 0 },
  credit: { pct: 4.99, fixed: 0.5 },
};

describe("paymentFee", () => {
  it("Pix e dinheiro sem taxa", () => {
    expect(paymentFee(180, "pix", rates)).toBe(0);
    expect(paymentFee(180, "cash", rates)).toBe(0);
  });

  it("crédito: % + fixa, em centavos", () => {
    // 180 × 4,99% = 8,982 + 0,50 = 9,482 → 9,48
    expect(paymentFee(180, "credit", rates)).toBe(9.48);
  });

  it("débito: só o %", () => {
    expect(paymentFee(100, "debit", rates)).toBe(1.99);
  });

  it("Pix com taxa configurada (conta PJ)", () => {
    expect(paymentFee(50, "pix", { ...rates, pix: { pct: 0.99, fixed: 0 } })).toBe(0.5);
  });

  it("nunca passa do valor do pagamento", () => {
    expect(paymentFee(0.3, "credit", rates)).toBe(0.3);
    expect(paymentFee(0, "credit", rates)).toBe(0);
  });

  it("cartão antigo (sem débito/crédito) não tem taxa conhecida", () => {
    expect(paymentFee(100, "card", rates)).toBeNull();
  });
});

describe("orderPaymentFees", () => {
  it("tudo no Pix: taxa 0 (o caso do pedido de R$ 180)", () => {
    expect(orderPaymentFees([{ amount: 180, paidOn: "2026-10-20", method: "pix" }], rates)).toBe(0);
  });

  it("tudo no crédito", () => {
    expect(orderPaymentFees([{ amount: 180, paidOn: "2026-10-20", method: "credit" }], rates)).toBe(9.48);
  });

  it("sinal no Pix e restante no crédito: taxa só no restante", () => {
    const payments = [
      { amount: 90, paidOn: "2026-10-20", method: "pix" as const },
      { amount: 90, paidOn: "2026-10-27", method: "credit" as const },
    ];
    // 90 × 4,99% = 4,491 + 0,50 = 4,991 → 4,99
    expect(orderPaymentFees(payments, rates)).toBe(4.99);
  });

  it("pagamento ainda não recebido não conta", () => {
    const payments = [
      { amount: 90, paidOn: "2026-10-20", method: "pix" as const },
      { amount: 90, paidOn: null, method: null },
    ];
    expect(orderPaymentFees(payments, rates)).toBe(0);
  });
});

describe("paymentRates", () => {
  it("lê as colunas do canal", () => {
    const row = { pix_pct: 0, pix_fixed: 0, cash_pct: 0, cash_fixed: 0, debit_pct: 1.5, debit_fixed: 0, credit_pct: 3.5, credit_fixed: 0.4 };
    expect(paymentRates(row).credit).toEqual({ pct: 3.5, fixed: 0.4 });
    expect(paymentRates(row).debit).toEqual({ pct: 1.5, fixed: 0 });
  });
});

describe("methodChannelFees", () => {
  it("lucro no crédito desconta a taxa da maquininha (fixa uma vez por peça)", () => {
    const pix = profitAtPrice(100, 40, methodChannelFees(rates.pix), 0);
    const credit = profitAtPrice(100, 40, methodChannelFees(rates.credit), 0);
    expect(pix.profit).toBe(60);
    expect(credit.profit).toBeCloseTo(60 - 4.99 - 0.5, 10);
  });
});

describe("rateLabel", () => {
  it("mostra % e a fixa quando houver", () => {
    expect(rateLabel("credit", rates.credit)).toBe("Cartão de crédito 4,99% + R$ 0,50");
    expect(rateLabel("pix", rates.pix)).toBe("Pix 0%");
  });
});

describe("paymentFees (financeiro)", () => {
  const order = (payments: { kind: "deposit" | "balance" | "full"; amount: number; paidOn: string | null; fee?: number | null }[], channelFees: number) => ({
    channelKind: "direct" as string | null,
    channelFees,
    payments,
  });

  it("pedido de R$ 180 no Pix: receita sem taxa", () => {
    expect(paymentFees(order([{ kind: "full", amount: 180, paidOn: "2026-10-20", fee: 0 }], 0))).toEqual([0]);
  });

  it("sinal no Pix e restante no crédito: taxa só no restante", () => {
    const o = order(
      [
        { kind: "deposit", amount: 90, paidOn: "2026-10-20", fee: 0 },
        { kind: "balance", amount: 90, paidOn: "2026-10-27", fee: 4.99 },
      ],
      4.99,
    );
    expect(paymentFees(o)).toEqual([0, 4.99]);
  });

  it("restante ainda não pago fica sem taxa", () => {
    const o = order(
      [
        { kind: "deposit", amount: 90, paidOn: "2026-10-20", fee: 0 },
        { kind: "balance", amount: 90, paidOn: null, fee: null },
      ],
      0,
    );
    expect(paymentFees(o)).toEqual([0, 0]);
  });

  it("registro antigo (sem taxa gravada): divide a taxa do pedido como antes", () => {
    const o = order(
      [
        { kind: "deposit", amount: 50, paidOn: "2026-10-20", fee: null },
        { kind: "balance", amount: 150, paidOn: "2026-10-27", fee: null },
      ],
      8,
    );
    expect(paymentFees(o)).toEqual([2, 6]);
  });

  it("outros canais continuam com a taxa do pedido", () => {
    const o = { ...order([{ kind: "full", amount: 100, paidOn: "2026-10-20", fee: 3 }], 10), channelKind: "other" };
    expect(paymentFees(o)).toEqual([10]);
  });
});
