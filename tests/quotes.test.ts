import { describe, expect, it } from "vitest";
import {
  daysUntil,
  defaultValidUntil,
  effectiveStatus,
  formatDay,
  quoteMessage,
  quoteProfit,
  quoteTotals,
  todayIso,
  whatsappLink,
  whatsappNumber,
} from "@/lib/quotes";

// 23h30 de 31/10 em São Paulo = 02h30 de 01/11 em UTC
const lateNightSP = new Date("2026-11-01T02:30:00Z");

describe("datas da validade", () => {
  it("hoje é o dia em São Paulo, não em UTC", () => {
    expect(todayIso(lateNightSP)).toBe("2026-10-31");
  });

  it("validade padrão: hoje + dias", () => {
    expect(defaultValidUntil(7, lateNightSP)).toBe("2026-11-07");
  });

  it("formatDay não muda o dia por causa de fuso", () => {
    expect(formatDay("2026-11-02")).toBe("02/11/2026");
  });

  it("dias até vencer e status expirado", () => {
    expect(daysUntil("2026-10-31", lateNightSP)).toBe(0);
    expect(daysUntil("2026-10-30", lateNightSP)).toBe(-1);
    expect(effectiveStatus("sent", "2026-10-31", lateNightSP)).toBe("sent"); // vence hoje: ainda vale
    expect(effectiveStatus("sent", "2026-10-30", lateNightSP)).toBe("expired");
    expect(effectiveStatus("approved", "2026-10-30", lateNightSP)).toBe("approved");
    expect(effectiveStatus("draft", "2026-10-30", lateNightSP)).toBe("draft");
  });
});

describe("quoteTotals", () => {
  const items = [
    { quantity: 2, unitPrice: 39.9 },
    { quantity: 1, unitPrice: 20 },
  ];

  it("subtotal, desconto em R$, frete e total", () => {
    const t = quoteTotals({ items, discountType: "amount", discountValue: 10, shippingCost: 15, depositPct: null });
    // 79,80 + 20 = 99,80 − 10 + 15 = 104,80
    expect(t).toEqual({ subtotal: 99.8, discount: 10, shipping: 15, total: 104.8, deposit: null, pixAmount: 104.8 });
  });

  it("desconto em % e sinal de 50%: o Pix cobra o sinal", () => {
    const t = quoteTotals({ items, discountType: "percent", discountValue: 10, shippingCost: 0, depositPct: 50 });
    // 99,80 − 9,98 = 89,82 → sinal 44,91
    expect(t.discount).toBe(9.98);
    expect(t.total).toBe(89.82);
    expect(t.deposit).toBe(44.91);
    expect(t.pixAmount).toBe(44.91);
  });

  it("desconto nunca passa do subtotal", () => {
    const t = quoteTotals({ items, discountType: "amount", discountValue: 500, shippingCost: 12, depositPct: null });
    expect(t.discount).toBe(99.8);
    expect(t.total).toBe(12);
  });
});

describe("quoteProfit", () => {
  const amounts = {
    items: [{ quantity: 2, unitPrice: 50, unitCost: 10 }],
    discountType: "amount" as const,
    discountValue: 0,
    shippingCost: 20,
    depositPct: null,
  };

  it("frete só passa pelo caixa; taxa do canal e imposto sobre o total", () => {
    // total 120; taxa 5% = 6; imposto 6% = 7,20; custo 20; frete 20 → lucro 66,80
    const p = quoteProfit(amounts, { commissionPct: 5, extraPct: null, fixedFee: null }, 6);
    expect(p.itemsCost).toBe(20);
    expect(p.channelFees).toBeCloseTo(6, 6);
    expect(p.tax).toBeCloseTo(7.2, 6);
    expect(p.profit).toBeCloseTo(66.8, 6);
  });

  it("item sem custo: lucro desconhecido, não zero", () => {
    const p = quoteProfit(
      { ...amounts, items: [...amounts.items, { quantity: 1, unitPrice: 10, unitCost: null }] },
      { commissionPct: null, extraPct: null, fixedFee: null },
      0,
    );
    expect(p.itemsCost).toBeNull();
    expect(p.profit).toBeNull();
  });
});

describe("WhatsApp", () => {
  it("número com 55 e DDD", () => {
    expect(whatsappNumber("(16) 99999-9999")).toBe("5516999999999");
    expect(whatsappNumber("+55 16 3333-4444")).toBe("551633334444");
    expect(whatsappNumber("99999-9999")).toBeNull();
    expect(whatsappNumber(null)).toBeNull();
  });

  it("link com a mensagem codificada", () => {
    expect(whatsappLink("16999999999", "Olá & até")).toBe("https://wa.me/5516999999999?text=Ol%C3%A1%20%26%20at%C3%A9");
    expect(whatsappLink(null, "oi")).toBe("https://wa.me/?text=oi");
  });

  it("mensagem pronta com primeiro nome, total, validade e link", () => {
    const text = quoteMessage({
      customerName: "Ana Paula Souza",
      storeName: "Vindra 3D",
      number: "VND-2026-0001",
      total: 104.8,
      validUntil: "2026-11-07",
      link: "https://vindra.app/o/abc",
    });
    expect(text).toBe(
      "Olá, Ana! Aqui é da Vindra 3D.\nSegue o orçamento VND-2026-0001, no total de R$ 104,80.\nVálido até 07/11/2026.\n\nVeja os detalhes e aprove por aqui: https://vindra.app/o/abc",
    );
  });
});
