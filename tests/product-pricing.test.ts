import { describe, expect, it } from "vitest";
import type { ContextSpool, PricingContext, SheetData, SheetFilament } from "@/lib/cost-sheet";
import { type VariantPricing, priceVariant, summarizeProduct, worstStatus } from "@/lib/product-pricing";

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

// Shopee 20% + R$ 4; TikTok com taxas em branco; Direto 5%. Sem imposto.
const ctx: PricingContext = {
  settings: {
    energy_rate_kwh: 0.8,
    labor_hour_rate: 30,
    failure_margin_pct: 10,
    default_margin_pct: 30,
    min_margin_pct: 15,
    tax_pct: 0,
    rounding_rule: "cents_90",
  },
  printers: [],
  channels: [
    { id: "shopee", name: "Shopee", kind: "shopee", commission_pct: 20, extra_pct: null, fixed_fee: 4 },
    { id: "tiktok", name: "TikTok Shop", kind: "tiktok", commission_pct: null, extra_pct: null, fixed_fee: null },
    { id: "direto", name: "Venda direta", kind: "direct", commission_pct: 5, extra_pct: null, fixed_fee: null },
  ],
  spools: [
    spool({}),
    spool({ id: "vermelho", color_name: "Vermelho", color_hex: "#ff0000", remaining_g: 0, status: "empty" }),
  ],
  materialAverages: { PLA: 0.12 },
};

// 100 g sem impressora, mão de obra nem insumos: só filamento + 10% de falha.
// Carretel preto (R$ 0,10/g) → R$ 10 → custo R$ 11,00. Média do PLA (R$ 0,12/g) → R$ 13,20.
const sheet = (filament: Partial<SheetFilament> = {}, over: Partial<SheetData> = {}): SheetData => ({
  printerId: null,
  printMinutes: 0,
  prepMinutes: 0,
  postMinutes: 0,
  purgeG: 0,
  packagingCost: 0,
  quantity: 1,
  piecesPerPlate: 1,
  filaments: [{ filamentId: "preto", material: "PLA", colorHex: "#111111", grams: 100, ...filament }],
  extras: [],
  ...over,
});

const channel = (v: VariantPricing, id: string) => v.channels.find((c) => c.channelId === id)!;

describe("priceVariant", () => {
  it("usa o custo atual da ficha e calcula o lucro no preço de cada canal", () => {
    const v = priceVariant(sheet(), { shopee: 40, direto: 30 }, ctx);
    expect(v.unitCost).toBeCloseTo(11, 6);
    expect(v.warnings).toEqual([]);

    const shopee = channel(v, "shopee");
    // 40 − (8 + 4) − 11 = 17 → 42,5%
    expect(shopee.status).toBe("ok");
    expect(shopee.profit?.profit).toBeCloseTo(17, 6);
    expect(shopee.profit?.marginPct).toBeCloseTo(42.5, 6);

    // 30 − 1,50 − 11 = 17,50
    expect(channel(v, "direto").status).toBe("ok");
    expect(channel(v, "direto").profit?.profit).toBeCloseTo(17.5, 6);
  });

  it("prejuízo e abaixo da margem mínima", () => {
    // Shopee a R$ 15: 15 − 7 − 11 = −3. Direto a R$ 12: 12 − 0,60 − 11 = 0,40 → 3,3%
    const v = priceVariant(sheet(), { shopee: 15, direto: 12 }, ctx);
    expect(channel(v, "shopee").status).toBe("loss");
    expect(channel(v, "direto").status).toBe("below_min");
    expect(v.worst).toBe("loss");
  });

  it("canal com taxas em branco mostra 'taxas não configuradas' no lugar de ok", () => {
    const v = priceVariant(sheet(), { tiktok: 30 }, ctx);
    const tiktok = channel(v, "tiktok");
    expect(tiktok.status).toBe("fees_not_configured");
    expect(tiktok.feesConfigured).toBe(false);
    expect(tiktok.profit?.profit).toBeCloseTo(19, 6);
  });

  it("margem ruim vale mais que taxas em branco", () => {
    // TikTok a R$ 12: 12 − 0 − 11 = 1 → 8,3%
    expect(channel(priceVariant(sheet(), { tiktok: 12 }, ctx), "tiktok").status).toBe("below_min");
  });

  it("sem preço: mostra o sugerido e não conta como margem ruim", () => {
    const v = priceVariant(sheet(), { shopee: null, direto: 0 }, ctx);
    for (const id of ["shopee", "tiktok", "direto"]) {
      const c = channel(v, id);
      expect(c.status).toBe("no_price");
      expect(c.profit).toBeNull();
      expect(c.suggested?.ok).toBe(true);
    }
    // (11 + 4) ÷ (1 − 0,20 − 0,30) = 30 → arredonda para 30,90
    expect(channel(v, "shopee").suggested).toMatchObject({ ok: true, price: 30.9 });
    expect(summarizeProduct([v]).badMargin).toBe(false);
  });

  it("sem ficha: nada a calcular", () => {
    const v = priceVariant(null, { shopee: 40 }, ctx);
    expect(v.unitCost).toBeNull();
    expect(v.channels.every((c) => c.status === "no_sheet" && c.suggested === null)).toBe(true);
    expect(v.worst).toBe("no_sheet");
  });

  it("ficha inválida vira aviso e é tratada como sem ficha", () => {
    const v = priceVariant(sheet({}, { quantity: 0 }), { shopee: 40 }, ctx);
    expect(v.unitCost).toBeNull();
    expect(v.warnings[0]).toMatch(/^Ficha inválida/);
    expect(v.worst).toBe("no_sheet");
  });

  describe("carretel que não vale mais: usa a média atual do material e avisa", () => {
    it("carretel que acabou", () => {
      const v = priceVariant(sheet({ filamentId: "vermelho", colorHex: "#ff0000" }), {}, ctx);
      expect(v.unitCost).toBeCloseTo(13.2, 6);
      expect(v.warnings).toEqual(["O carretel PLA Vermelho acabou: usando a média do PLA."]);
    });

    it("carretel excluído (o banco zerou o filamentId e marcou spoolRemoved)", () => {
      const v = priceVariant(sheet({ filamentId: null, spoolRemoved: true }), {}, ctx);
      expect(v.unitCost).toBeCloseTo(13.2, 6);
      expect(v.warnings).toEqual(["O carretel escolhido foi excluído: usando a média do PLA."]);
    });

    it("carretel que não está mais no contexto", () => {
      const v = priceVariant(sheet({ filamentId: "sumiu" }), {}, ctx);
      expect(v.unitCost).toBeCloseTo(13.2, 6);
      expect(v.warnings).toEqual(["O carretel escolhido não existe mais: usando a média do PLA."]);
    });

    it("média escolhida de propósito não gera aviso", () => {
      const v = priceVariant(sheet({ filamentId: null }), {}, ctx);
      expect(v.unitCost).toBeCloseTo(13.2, 6);
      expect(v.warnings).toEqual([]);
    });
  });
});

describe("summarizeProduct", () => {
  it("junta as variações: pior situação, margem ruim, taxas em branco e menor margem", () => {
    const boa = priceVariant(sheet(), { shopee: 40 }, ctx); // 42,5%
    const semTaxas = priceVariant(sheet(), { tiktok: 30 }, ctx); // 63,3%
    const s = summarizeProduct([boa, semTaxas]);
    expect(s.worst).toBe("fees_not_configured");
    expect(s.badMargin).toBe(false);
    expect(s.feesNotConfigured).toBe(true);
    expect(s.lowestMarginPct).toBeCloseTo(42.5, 6);

    const ruim = priceVariant(sheet(), { direto: 12 }, ctx);
    expect(summarizeProduct([boa, ruim])).toMatchObject({ worst: "below_min", badMargin: true });
  });

  it("sem nenhum preço: menor margem null", () => {
    expect(summarizeProduct([priceVariant(sheet(), {}, ctx)]).lowestMarginPct).toBeNull();
    expect(summarizeProduct([])).toMatchObject({ worst: "ok", badMargin: false, lowestMarginPct: null });
  });

  it("não repete o mesmo aviso de duas variações", () => {
    const a = priceVariant(sheet({ filamentId: "vermelho" }), {}, ctx);
    const b = priceVariant(sheet({ filamentId: "vermelho" }), {}, ctx);
    expect(summarizeProduct([a, b]).warnings).toHaveLength(1);
  });
});

describe("worstStatus", () => {
  it("ordena da mais grave para a mais tranquila", () => {
    expect(worstStatus(["ok", "no_price", "fees_not_configured"])).toBe("fees_not_configured");
    expect(worstStatus(["fees_not_configured", "no_sheet"])).toBe("no_sheet");
    expect(worstStatus(["no_sheet", "below_min"])).toBe("below_min");
    expect(worstStatus(["below_min", "loss"])).toBe("loss");
    expect(worstStatus([])).toBe("ok");
  });
});
