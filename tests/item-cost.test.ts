import { describe, expect, it } from "vitest";
import { type ContextSpool, type PricingContext, evaluateSheet } from "@/lib/cost-sheet";
import { type FinanceOrder, buildDre, missingCostOrders, orderResult } from "@/lib/finance";
import {
  type ItemCost,
  costInputOf,
  evaluateItemCost,
  itemCostFields,
  itemMargin,
  itemSheet,
  manualItemCost,
  storedItemCost,
} from "@/lib/item-cost";
import { expectedConsumption, orderProfit } from "@/lib/orders";
import { quoteTotals } from "@/lib/quotes";
import { itemCostSchema } from "@/lib/validation/sheet";

// carretel com uuid de verdade: a validação do custo exige
const PRETO = "6f1d2c3b-4a5e-4f60-8a71-92b3c4d5e6f7";

const spool = (over: Partial<ContextSpool> = {}): ContextSpool => ({
  id: PRETO,
  material: "PLA",
  color_name: "Preto",
  color_hex: "#111111",
  cost_per_gram: 0.1,
  remaining_g: 800,
  status: "in_use",
  brand: null,
  ...over,
});

// sem impressora (sem máquina), hora R$ 30, falha 10%
const ctx: PricingContext = {
  settings: {
    energy_rate_kwh: null,
    labor_hour_rate: 30,
    failure_margin_pct: 10,
    default_margin_pct: 30,
    min_margin_pct: 15,
    tax_pct: 0,
    rounding_rule: "none",
  },
  printers: [],
  channels: [],
  spools: [spool()],
  materialAverages: { PLA: 0.12 },
  lastMaterialCosts: {},
};

// 100 g do carretel preto (R$ 10 por mesa, 1 peça por mesa), preparo 30 min por lote, pós 6 min por peça
type CalcCost = Extract<ItemCost, { source: "calc" }>;
const sheet = (over: Partial<CalcCost["sheet"]> = {}): CalcCost => ({
  source: "calc",
  sheet: {
    printerId: null,
    printMinutes: 120,
    prepMinutes: 30,
    postMinutes: 6,
    purgeG: 0,
    packagingCost: 0,
    quantity: 1,
    piecesPerPlate: 1,
    filaments: [{ filamentId: PRETO, material: "PLA", colorHex: "#111111", grams: 100 }],
    extras: [],
    ...over,
  },
});

describe("custo manual", () => {
  it("custo + mão de obra = custo por peça; a mão de obra é a parte de labor", () => {
    expect(manualItemCost(12, 5)).toEqual({ unitCost: 17, unitLaborCost: 5 });
    const ev = evaluateItemCost({ source: "manual", cost: 12, labor: 5 }, 3, ctx);
    expect(ev.ok && ev.unitCost).toBe(17);
    expect(ev.ok && ev.unitLaborCost).toBe(5);
  });

  it("sem mão de obra", () => {
    expect(manualItemCost(8.5, 0)).toEqual({ unitCost: 8.5, unitLaborCost: 0 });
  });

  it("a quantidade não muda o custo manual (é por peça)", () => {
    const one = evaluateItemCost({ source: "manual", cost: 10, labor: 2 }, 1, ctx);
    const ten = evaluateItemCost({ source: "manual", cost: 10, labor: 2 }, 10, ctx);
    expect(one).toEqual(ten);
  });
});

describe("mini calculadora", () => {
  it("é a mesma conta da calculadora, com a quantidade do item", () => {
    const item = sheet();
    const ev = evaluateItemCost(item, 3, ctx);
    const calc = evaluateSheet({ ...item.sheet, quantity: 3 }, ctx);
    expect(ev.ok && calc.ok).toBe(true);
    if (!ev.ok || !calc.ok) return;
    expect(ev.unitCost).toBeCloseTo(calc.result.unit.total, 4);
    // filamento 10 + mão de obra (30 + 6×3) min ÷ 60 × 30 ÷ 3 peças = 8 → 18 + 10% de falha = 19,80
    expect(ev.unitCost).toBeCloseTo(19.8, 4);
    // a mão de obra leva o mesmo acréscimo da falha: 8 × 1,1
    expect(ev.unitLaborCost).toBeCloseTo(8.8, 4);
  });

  it("mais peças diluem o preparo do lote", () => {
    const one = evaluateItemCost(sheet(), 1, ctx);
    const ten = evaluateItemCost(sheet(), 10, ctx);
    expect(one.ok && ten.ok && ten.unitCost < one.unitCost).toBe(true);
  });

  it("material nunca comprado não vira R$ 0", () => {
    const ev = evaluateItemCost(
      sheet({ filaments: [{ filamentId: null, material: "TPU", colorHex: null, grams: 50 }] }),
      1,
      ctx,
    );
    expect(ev.ok).toBe(false);
    const fields = itemCostFields(
      sheet({ filaments: [{ filamentId: null, material: "TPU", colorHex: null, grams: 50 }] }),
      1,
      ctx,
    );
    expect(fields.ok).toBe(false);
  });
});

describe("custo guardado no item", () => {
  it("cost_source + cost_input voltam iguais (mini calculadora e manual)", () => {
    const calc = sheet();
    expect(storedItemCost("calc", costInputOf(calc))).toEqual(calc);
    const manual: ItemCost = { source: "manual", cost: 12, labor: 5 };
    expect(storedItemCost("manual", costInputOf(manual))).toEqual(manual);
  });

  it("sem origem ou registro inválido = sem custo editável", () => {
    expect(storedItemCost(null, null)).toBeNull();
    expect(storedItemCost("manual", { cost: -1, labor: 0 })).toBeNull();
    expect(storedItemCost("outro", { cost: 1, labor: 0 })).toBeNull();
  });

  it("item sem custo continua permitido: tudo nulo", () => {
    expect(itemCostFields(null, 2, ctx)).toEqual({ ok: true, unitCost: null, unitLaborCost: null, costSource: null, costInput: null });
  });

  it("campos do banco com o custo manual", () => {
    expect(itemCostFields({ source: "manual", cost: 12, labor: 5 }, 2, ctx)).toEqual({
      ok: true,
      unitCost: 17,
      unitLaborCost: 5,
      costSource: "manual",
      costInput: { cost: 12, labor: 5 },
    });
  });
});

describe("preço inalterado", () => {
  it("o custo nunca mexe no preço do item nem no total do orçamento", () => {
    const items = [
      { quantity: 3, unitPrice: 25, cost: { source: "manual", cost: 4, labor: 1 } as ItemCost },
      { quantity: 1, unitPrice: 80, cost: sheet() },
    ];
    const before = quoteTotals({ items, discountType: "amount", discountValue: 0, shippingCost: 0, depositPct: null });
    const withCosts = items.map((i) => ({ ...i, ...itemCostFields(i.cost, i.quantity, ctx) }));
    const after = quoteTotals({ items: withCosts, discountType: "amount", discountValue: 0, shippingCost: 0, depositPct: null });
    expect(withCosts.map((i) => i.unitPrice)).toEqual([25, 80]);
    expect(after.total).toBe(155);
    expect(after).toEqual(before);
    // o que vai para o banco é só custo: nenhum campo de preço
    for (const i of items) expect(Object.keys(itemCostFields(i.cost, i.quantity, ctx))).not.toContain("unitPrice");
  });

  it("o item do formulário aceita custo, sem custo e o custo vazio", () => {
    expect(itemCostSchema.safeParse({ source: "manual", cost: 4, labor: 1 }).success).toBe(true);
    expect(itemCostSchema.safeParse({ source: "manual", cost: -4, labor: 1 }).success).toBe(false);
    expect(itemCostSchema.safeParse(sheet()).success).toBe(true);
  });

  it("lucro e margem do item usam o preço combinado", () => {
    // (25 − 5) × 3 = 60; 20/25 = 80%
    expect(itemMargin(3, 25, 5)).toEqual({ profit: 60, marginPct: 80 });
    expect(itemMargin(1, 0, 5).marginPct).toBeNull();
  });
});

describe("pedido com vários itens avulsos", () => {
  const items: { quantity: number; unitCost: number | null }[] = [
    { quantity: 3, unitCost: 5 }, // manual: 4 + 1 de mão de obra
    { quantity: 2, unitCost: 19.8 }, // mini calculadora
  ];

  it("todos com custo: o lucro do pedido sai", () => {
    const p = orderProfit({ total: 155, channelFees: 0, taxPct: 0, shipping: 0, items, failuresCost: 0 });
    // 155 − (15 + 39,6) = 100,40
    expect(p.itemsCost).toBeCloseTo(54.6, 6);
    expect(p.profit).toBeCloseTo(100.4, 6);
  });

  it("um sem custo: lucro não calculado", () => {
    const p = orderProfit({
      total: 155,
      channelFees: 0,
      taxPct: 0,
      shipping: 0,
      items: [...items, { quantity: 1, unitCost: null }],
      failuresCost: 0,
    });
    expect(p.profit).toBeNull();
  });

  const financeOrder = (over: Partial<FinanceOrder> = {}): FinanceOrder => ({
    id: "o1",
    number: "PED-2026-0007",
    status: "delivered",
    createdAt: "2026-10-05T15:00:00Z",
    total: 155,
    channelFees: 0,
    shipping: 0,
    paidByPlatform: false,
    consumedAt: "2026-10-06T12:00:00Z",
    channelName: "Venda direta",
    channelKind: "direct",
    payments: [{ kind: "full", amount: 155, paidOn: "2026-10-10" }],
    items: [
      { id: "i1", description: "Chaveiro", quantity: 3, unitPrice: 25, unitCost: 5, unitLaborCost: 1, printMinutes: null, productKey: "item:Chaveiro", productName: "Chaveiro" },
      { id: "i2", description: "Placa", quantity: 1, unitPrice: 80, unitCost: null, unitLaborCost: null, printMinutes: null, productKey: "item:Placa", productName: "Placa" },
    ],
    ...over,
  });

  it("DRE: aviso e lista levam ao item sem custo", () => {
    const dre = buildDre({ month: "2026-10", orders: [financeOrder()], failures: [], transactions: [], taxPct: 0 });
    expect(dre.ordersMissingCost).toBe(1);
    expect(missingCostOrders([financeOrder()], "2026-10")).toEqual([
      { id: "o1", number: "PED-2026-0007", status: "delivered", recognizedOn: "2026-10-10", items: [{ id: "i2", description: "Placa" }] },
    ]);
    // outro mês não lista; "todos" lista
    expect(missingCostOrders([financeOrder()], "2026-09")).toEqual([]);
    expect(missingCostOrders([financeOrder()], null)).toHaveLength(1);
  });

  it("depois de definir o custo, o DRE recalcula e o aviso some", () => {
    const fixed = financeOrder({
      items: financeOrder().items.map((i) => (i.id === "i2" ? { ...i, unitCost: 30, unitLaborCost: 10 } : i)),
    });
    const r = orderResult(fixed, 0);
    expect(r.missingCost).toBe(false);
    expect(r.productsCost).toBe(45);
    expect(r.labor).toBe(13);
    expect(missingCostOrders([fixed], null)).toEqual([]);
  });

  it("cancelado sem peças impressas não entra na lista", () => {
    expect(missingCostOrders([financeOrder({ status: "cancelled", consumedAt: null })], null)).toEqual([]);
  });
});

describe("previsão de filamento do item avulso", () => {
  it("gramas e carretel da mini calculadora entram na baixa do pedido", () => {
    const calc = sheet({ piecesPerPlate: 2 });
    // 4 peças ÷ 2 por mesa = 2 mesas × 100 g
    expect(expectedConsumption([{ sheet: itemSheet(calc, 4), quantity: 4 }])).toEqual([
      { filamentId: PRETO, material: "PLA", colorHex: "#111111", grams: 200 },
    ]);
  });

  it("custo manual não tem previsão", () => {
    expect(itemSheet({ source: "manual", cost: 1, labor: 0 }, 4)).toBeNull();
  });
});
