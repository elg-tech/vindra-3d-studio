import { type PricingContext, type SheetData, channelFees, resolveFilament, toCostInput } from "@/lib/cost-sheet";
import {
  PricingInputError,
  type ProfitResult,
  type SuggestedPrice,
  calculateCost,
  isChannelConfigured,
  profitAtPrice,
  suggestPrice,
} from "@/lib/pricing";

/**
 * Lucro de cada variação em cada canal, recalculado com os preços e taxas ATUAIS
 * (carretéis, configurações e canais do PricingContext). O unit_cost guardado na
 * ficha é só cache: aqui ele nunca é usado.
 */

/**
 * Situação de um canal, da mais grave para a mais tranquila.
 * - no_sheet: variação sem ficha de custo (ou ficha inválida): não há como calcular.
 * - no_price: sem preço naquele canal. Não conta como margem ruim.
 * - loss / below_min: prejuízo ou margem abaixo do mínimo das Configurações.
 * - fees_not_configured: lucro calculado com taxas em branco; aparece no lugar de "ok".
 */
export type ChannelStatus = "no_sheet" | "loss" | "below_min" | "fees_not_configured" | "no_price" | "ok";

const SEVERITY: Record<ChannelStatus, number> = {
  loss: 5,
  below_min: 4,
  no_sheet: 3,
  fees_not_configured: 2,
  no_price: 1,
  ok: 0,
};

export type ChannelPricing = {
  channelId: string;
  status: ChannelStatus;
  feesConfigured: boolean;
  price: number | null;
  /** Lucro no preço atual; null sem preço ou sem ficha. */
  profit: ProfitResult | null;
  /** Preço sugerido com a margem padrão; null sem ficha. */
  suggested: SuggestedPrice | null;
};

export type VariantPricing = {
  unitCost: number | null;
  /** Carretel que acabou ou foi excluído, ficha inválida. */
  warnings: string[];
  channels: ChannelPricing[];
  worst: ChannelStatus;
};

/** Preço por canal: chave = id do canal; ausente, null ou ≤ 0 = sem preço. */
export type VariantPrices = Record<string, number | null | undefined>;

export function priceVariant(sheet: SheetData | null, prices: VariantPrices, ctx: PricingContext): VariantPricing {
  const { tax_pct, min_margin_pct, default_margin_pct, rounding_rule } = ctx.settings;
  const warnings: string[] = [];
  let unitCost: number | null = null;

  if (sheet) {
    for (const row of sheet.filaments) {
      const { warning } = resolveFilament(row, ctx);
      if (warning) warnings.push(warning);
    }
    try {
      unitCost = calculateCost(toCostInput(sheet, ctx)).unit.total;
    } catch (e) {
      if (!(e instanceof PricingInputError)) throw e;
      warnings.push(`Ficha inválida: ${e.message}`);
    }
  }

  const channels = ctx.channels.map((c): ChannelPricing => {
    const fees = channelFees(c);
    const feesConfigured = isChannelConfigured(fees);
    const raw = prices[c.id];
    const price = raw !== null && raw !== undefined && raw > 0 ? raw : null;

    if (unitCost === null) {
      return { channelId: c.id, status: "no_sheet", feesConfigured, price, profit: null, suggested: null };
    }
    const suggested = suggestPrice(unitCost, fees, tax_pct, default_margin_pct, rounding_rule);
    if (price === null) {
      return { channelId: c.id, status: "no_price", feesConfigured, price, profit: null, suggested };
    }
    const profit = profitAtPrice(price, unitCost, fees, tax_pct);
    const status: ChannelStatus =
      profit.profit < 0
        ? "loss"
        : profit.marginPct < min_margin_pct
          ? "below_min"
          : feesConfigured
            ? "ok"
            : "fees_not_configured";
    return { channelId: c.id, status, feesConfigured, price, profit, suggested };
  });

  return { unitCost, warnings, channels, worst: worstStatus(channels.map((c) => c.status)) };
}

export function worstStatus(statuses: ChannelStatus[]): ChannelStatus {
  return statuses.reduce<ChannelStatus>((w, s) => (SEVERITY[s] > SEVERITY[w] ? s : w), "ok");
}

export type ProductSummary = {
  worst: ChannelStatus;
  /** Algum canal com preço em prejuízo ou abaixo da margem mínima. */
  badMargin: boolean;
  /** Algum canal com preço calculado sobre taxas em branco. */
  feesNotConfigured: boolean;
  /** Menor margem entre os canais com preço; null se nenhum tem preço. */
  lowestMarginPct: number | null;
  warnings: string[];
};

/** Resumo do produto a partir das variações ATIVAS (o chamador filtra). */
export function summarizeProduct(variants: VariantPricing[]): ProductSummary {
  const channels = variants.flatMap((v) => v.channels);
  const margins = channels.flatMap((c) => (c.profit ? [c.profit.marginPct] : []));
  return {
    worst: worstStatus(variants.map((v) => v.worst)),
    badMargin: channels.some((c) => c.status === "loss" || c.status === "below_min"),
    feesNotConfigured: channels.some((c) => c.status === "fees_not_configured"),
    lowestMarginPct: margins.length > 0 ? Math.min(...margins) : null,
    warnings: [...new Set(variants.flatMap((v) => v.warnings))],
  };
}
