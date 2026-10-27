import { describe, expect, it } from "vitest";
import type { ContextSpool, PricingContext, SheetData } from "@/lib/cost-sheet";
import {
  addBusinessDays,
  dueDateFromToday,
  expectedConsumption,
  failureCost,
  itemPrintMinutes,
  machineCostPerHour,
  moveWarning,
  orderProfit,
  paymentState,
  plannedPayments,
  queueMinutes,
  suggestSpool,
} from "@/lib/orders";

const sheet = (over: Partial<SheetData> = {}): SheetData => ({
  printerId: null,
  printMinutes: 120,
  prepMinutes: 0,
  postMinutes: 0,
  purgeG: 0,
  packagingCost: 0,
  quantity: 1,
  piecesPerPlate: 1,
  filaments: [{ filamentId: "preto", material: "PLA", colorHex: "#111111", grams: 40 }],
  extras: [],
  ...over,
});

const spool = (over: Partial<ContextSpool>): ContextSpool => ({
  id: "preto",
  material: "PLA",
  color_name: "Preto",
  color_hex: "#111111",
  cost_per_gram: 0.1,
  remaining_g: 800,
  status: "in_use",
  brand: null,
  ...over,
});

describe("prazo em dias úteis", () => {
  it("pula sábado e domingo", () => {
    // 2026-10-30 é sexta: +1 útil = segunda 02/11; +5 = sexta 06/11
    expect(addBusinessDays("2026-10-30", 1)).toBe("2026-11-02");
    expect(addBusinessDays("2026-10-30", 5)).toBe("2026-11-06");
    expect(addBusinessDays("2026-10-31", 1)).toBe("2026-11-02"); // de sábado
    expect(addBusinessDays("2026-10-27", 0)).toBe("2026-10-27");
  });

  it("parte de hoje em São Paulo", () => {
    // 23h30 de sexta (30/10) em SP = sábado 02h30 UTC
    expect(dueDateFromToday(1, new Date("2026-10-31T02:30:00Z"))).toBe("2026-11-02");
  });
});

describe("expectedConsumption", () => {
  it("gramas por mesa × mesas; purga dividida pelos gramas", () => {
    const s = sheet({
      piecesPerPlate: 2,
      purgeG: 10,
      filaments: [
        { filamentId: "preto", material: "PLA", colorHex: "#111111", grams: 30 },
        { filamentId: null, material: "PLA", colorHex: "#ffffff", grams: 10 },
      ],
    });
    // 4 peças = 2 mesas. Preto: (30 + 7,5) × 2 = 75. Branco: (10 + 2,5) × 2 = 25
    expect(expectedConsumption([{ sheet: s, quantity: 4 }])).toEqual([
      { filamentId: "preto", material: "PLA", colorHex: "#111111", grams: 75 },
      { filamentId: null, material: "PLA", colorHex: "#ffffff", grams: 25 },
    ]);
  });

  it("soma o mesmo carretel de itens diferentes e ignora item sem ficha", () => {
    const lines = expectedConsumption([
      { sheet: sheet(), quantity: 1 },
      { sheet: sheet(), quantity: 2 },
      { sheet: null, quantity: 5 },
    ]);
    expect(lines).toEqual([{ filamentId: "preto", material: "PLA", colorHex: "#111111", grams: 120 }]);
  });
});

describe("suggestSpool", () => {
  const spools = [
    spool({}),
    spool({ id: "preto-vazio", remaining_g: 0, status: "empty" }),
    spool({ id: "cinza", color_name: "Cinza", color_hex: "#222222", remaining_g: 300 }),
    spool({ id: "vermelho", color_name: "Vermelho", color_hex: "#ff0000", remaining_g: 900 }),
  ];

  it("o carretel da ficha, se tiver saldo", () => {
    expect(suggestSpool({ filamentId: "preto", material: "PLA", colorHex: "#111111", grams: 10 }, spools)?.id).toBe("preto");
  });

  it("carretel da ficha acabou: cor mais próxima com saldo", () => {
    expect(suggestSpool({ filamentId: "preto-vazio", material: "PLA", colorHex: "#111111", grams: 10 }, spools)?.id).toBe("preto");
  });

  it("sem cor: o mais cheio do material; sem material: nenhum", () => {
    expect(suggestSpool({ filamentId: null, material: "PLA", colorHex: null, grams: 10 }, spools)?.id).toBe("vermelho");
    expect(suggestSpool({ filamentId: null, material: "TPU", colorHex: null, grams: 10 }, spools)).toBeNull();
  });
});

describe("fila de impressão", () => {
  const now = new Date("2026-10-27T12:00:00Z");
  it("na fila conta inteiro; imprimindo desconta o tempo decorrido, sem ficar negativo", () => {
    expect(
      queueMinutes(
        [
          { status: "queued", statusChangedAt: "2026-10-27T08:00:00Z", printMinutes: 120 },
          { status: "printing", statusChangedAt: "2026-10-27T11:00:00Z", printMinutes: 150 }, // 60 min já
          { status: "printing", statusChangedAt: "2026-10-27T06:00:00Z", printMinutes: 90 }, // passou: 0
          { status: "ready", statusChangedAt: "2026-10-27T06:00:00Z", printMinutes: 500 },
        ],
        now,
      ),
    ).toBe(120 + 90);
  });

  it("tempo do item: por mesa × mesas", () => {
    expect(itemPrintMinutes(sheet({ piecesPerPlate: 4 }), 6)).toBe(180);
    expect(itemPrintMinutes(null, 3)).toBeNull();
  });
});

describe("pagamento", () => {
  it("com sinal: dois pagamentos; sem sinal: um", () => {
    expect(plannedPayments(99.8, 49.9)).toEqual([
      { kind: "deposit", amount: 49.9 },
      { kind: "balance", amount: 49.9 },
    ]);
    expect(plannedPayments(94.8, null)).toEqual([{ kind: "full", amount: 94.8 }]);
    expect(plannedPayments(94.8, 94.8)).toEqual([{ kind: "full", amount: 94.8 }]);
  });

  it("estado e selo", () => {
    const deposit = { kind: "deposit" as const, amount: 50, paidOn: null };
    const balance = { kind: "balance" as const, amount: 50, paidOn: null };
    expect(paymentState([deposit, balance], false)).toBe("awaiting_deposit");
    expect(paymentState([{ ...deposit, paidOn: "2026-10-27" }, balance], false)).toBe("deposit_paid");
    expect(paymentState([{ ...deposit, paidOn: "2026-10-27" }, { ...balance, paidOn: "2026-10-30" }], false)).toBe("paid");
    expect(paymentState([{ kind: "full", amount: 90, paidOn: null }], false)).toBe("awaiting_payment");
    expect(paymentState([], true)).toBe("platform");
  });

  it("avisos ao mover (sem bloquear)", () => {
    expect(moveWarning("printing", "awaiting_deposit")).toBe("O sinal ainda não foi pago.");
    expect(moveWarning("printing", "deposit_paid")).toBeNull();
    expect(moveWarning("shipped", "deposit_paid")).toBe("O restante ainda não foi pago.");
    expect(moveWarning("delivered", "awaiting_payment")).toBe("O pedido ainda não foi pago.");
    expect(moveWarning("delivered", "platform")).toBeNull();
    expect(moveWarning("queued", "awaiting_deposit")).toBeNull();
  });
});

describe("custos do pedido", () => {
  const ctx = {
    settings: { energy_rate_kwh: 0.8 },
    printers: [{ id: "a1", name: "A1", is_default: true, purchase_price: 2500, lifetime_hours: 5000, power_watts: 100, maintenance_per_hour: 0.1 }],
  } as unknown as PricingContext;

  it("máquina por hora: 0,50 + 0,08 + 0,10", () => {
    expect(machineCostPerHour(ctx)).toBeCloseTo(0.68, 6);
  });

  it("falha: filamento + tempo de máquina", () => {
    // 30 g × 0,10 = 3,00 + 90 min × 0,68/h = 1,02 → 4,02
    expect(failureCost({ grams: 30, costPerGram: 0.1, minutes: 90, machinePerHour: 0.68 })).toBe(4.02);
  });

  it("lucro: total − taxas − imposto − frete − peças − falhas", () => {
    const p = orderProfit({
      total: 120,
      channelFees: 6,
      taxPct: 6,
      shipping: 20,
      items: [{ quantity: 2, unitCost: 10 }],
      failuresCost: 4.02,
    });
    // 120 − 6 − 7,20 − 20 − 20 − 4,02 = 62,78
    expect(p.profit).toBeCloseTo(62.78, 6);
    expect(orderProfit({ total: 50, channelFees: 0, taxPct: 0, shipping: 0, items: [{ quantity: 1, unitCost: null }], failuresCost: 0 }).profit).toBeNull();
  });
});
