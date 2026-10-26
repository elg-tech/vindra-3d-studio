import { z } from "zod";
import { FILAMENT_STATUS, MATERIALS } from "@/lib/filaments";
import { MODEL_SOURCES } from "@/lib/products";
import {
  decimal,
  optionalDecimal,
  optionalPercent,
  optionalText,
  percent,
  requiredText,
} from "./fields";

// ---------------------------------------------------------------
// Configurações
// ---------------------------------------------------------------
export const ROUNDING_RULES = ["none", "cents_90", "cents_99", "integer"] as const;

export const costSettingsSchema = z
  .object({
    energy_rate_kwh: optionalDecimal({ min: 0, max: 20 }),
    labor_hour_rate: optionalDecimal({ min: 0 }),
    failure_margin_pct: percent(),
    default_margin_pct: percent(),
    min_margin_pct: percent(),
    tax_pct: percent(),
    rounding_rule: z.enum(ROUNDING_RULES),
  })
  .refine((v) => v.min_margin_pct <= v.default_margin_pct, {
    path: ["min_margin_pct"],
    message: "A margem mínima não pode ser maior que a margem padrão.",
  });

export const storeSettingsSchema = z.object({
  store_name: requiredText(80),
  store_whatsapp: optionalText(20).refine((v) => v === null || /^\+?[\d\s()-]{10,20}$/.test(v), {
    message: "WhatsApp inválido. Ex.: (16) 99999-9999",
  }),
  store_instagram: optionalText(60),
  store_email: optionalText(120).refine((v) => v === null || z.email().safeParse(v).success, {
    message: "E-mail inválido.",
  }),
  store_city: optionalText(80),
  pix_key: optionalText(120),
  default_quote_terms: optionalText(2000),
  quote_validity_days: decimal({ int: true, min: 1, max: 365 }),
});

export const channelSchema = z.object({
  id: z.uuid(),
  commission_pct: optionalPercent(),
  extra_pct: optionalPercent(),
  fixed_fee: optionalDecimal({ min: 0 }),
  active: z.boolean(),
});

// ---------------------------------------------------------------
// Impressoras
// ---------------------------------------------------------------
export const printerSchema = z.object({
  id: z.uuid().optional(),
  name: requiredText(80),
  model: optionalText(80),
  purchase_price: optionalDecimal({ min: 0 }),
  lifetime_hours: optionalDecimal({ positive: true }),
  power_watts: optionalDecimal({ min: 0, max: 5000 }),
  maintenance_per_hour: optionalDecimal({ min: 0 }),
  is_default: z.boolean(),
  active: z.boolean(),
});

// ---------------------------------------------------------------
// Marcas de filamento
// ---------------------------------------------------------------
export const brandSchema = z.object({
  id: z.uuid().optional(),
  name: requiredText(60),
  empty_spool_weight_g: optionalDecimal({ min: 0, max: 2000 }),
});

// ---------------------------------------------------------------
// Filamentos
// ---------------------------------------------------------------
export const filamentSchema = z.object({
  id: z.uuid().optional(),
  brand_id: z.union([z.uuid(), z.literal("")]).transform((v) => (v === "" ? null : v)),
  material: z.enum(MATERIALS),
  color_name: requiredText(60),
  color_hex: z.string().regex(/^#[0-9A-Fa-f]{6}$/, "Cor inválida."),
  diameter_mm: decimal({ positive: true, max: 5 }),
  price_paid: decimal({ min: 0 }),
  shipping_cost: decimal({ min: 0 }),
  net_weight_g: decimal({ positive: true, max: 10000 }),
  min_stock_g: decimal({ min: 0, max: 10000 }),
  purchased_at: z
    .string()
    .trim()
    .refine((v) => v === "" || /^\d{4}-\d{2}-\d{2}$/.test(v), "Data inválida.")
    .transform((v) => (v === "" ? null : v)),
  supplier: optionalText(80),
  notes: optionalText(500),
});

/** Pesagem: peso total na balança (carretel + filamento). */
export const weighSchema = z.object({
  id: z.uuid(),
  scale_weight_g: decimal({ min: 0, max: 10000 }),
  empty_spool_weight_g: decimal({ min: 0, max: 2000 }),
  save_as_brand_default: z.boolean(),
});

/** Ajuste manual ou falha de impressão: gramas a descontar (ou somar, no ajuste). */
export const movementSchema = z.object({
  id: z.uuid(),
  kind: z.enum(["adjustment", "failure"]),
  grams: decimal({ min: -10000, max: 10000 }).refine((v) => v !== 0, "Informe uma quantidade diferente de zero."),
  notes: optionalText(300),
});

export const filamentStatusSchema = z.object({
  id: z.uuid(),
  status: z.enum(FILAMENT_STATUS),
});

// ---------------------------------------------------------------
// Insumos
// ---------------------------------------------------------------
export const supplySchema = z.object({
  id: z.uuid().optional(),
  name: requiredText(80),
  unit: requiredText(10),
  unit_cost: decimal({ min: 0 }),
  is_packaging: z.boolean(),
  stock_qty: optionalDecimal({ min: 0 }),
  notes: optionalText(300),
});

export type CostSettingsInput = z.input<typeof costSettingsSchema>;
export type StoreSettingsInput = z.input<typeof storeSettingsSchema>;
export type ChannelInput = z.input<typeof channelSchema>;
export type PrinterInput = z.input<typeof printerSchema>;
export type BrandInput = z.input<typeof brandSchema>;
export type FilamentInput = z.input<typeof filamentSchema>;
export type WeighInput = z.input<typeof weighSchema>;
export type MovementInput = z.input<typeof movementSchema>;
export type SupplyInput = z.input<typeof supplySchema>;

// ---------------------------------------------------------------
// Ficha de custo (calculadora) — chega já em números
// ---------------------------------------------------------------
const minutes = z.number().int("Use minutos inteiros.").min(0, "Não pode ser negativo.").max(100_000);

export const costSheetSchema = z.object({
  id: z.uuid().optional(),
  name: requiredText(120),
  printerId: z.uuid().nullable(),
  printMinutes: minutes,
  prepMinutes: minutes,
  postMinutes: minutes,
  purgeG: z.number().min(0, "Não pode ser negativo.").max(10_000),
  packagingCost: z.number().min(0, "Não pode ser negativo.").max(100_000),
  quantity: z.number().int("Use um número inteiro.").min(1, "Mínimo 1.").max(10_000),
  piecesPerPlate: z.number().int("Use um número inteiro.").min(1, "Mínimo 1.").max(1_000),
  filaments: z
    .array(
      z.object({
        filamentId: z.uuid().nullable(),
        material: z.enum(MATERIALS),
        colorHex: z
          .string()
          .regex(/^#[0-9A-Fa-f]{6}$/)
          .nullable(),
        grams: z.number().min(0, "Não pode ser negativo.").max(10_000),
      }),
    )
    .max(16, "No máximo 16 filamentos."),
  extras: z
    .array(
      z.object({
        supplyId: z.uuid().nullable(),
        name: requiredText(80),
        quantity: z.number().positive("Quantidade precisa ser maior que zero.").max(10_000),
        unitCost: z.number().min(0, "Não pode ser negativo.").max(100_000),
      }),
    )
    .max(30, "No máximo 30 insumos."),
  sourceFilePath: z.string().max(500).nullable(),
  notes: z.string().trim().max(1000).nullable(),
});

export type CostSheetInput = z.input<typeof costSheetSchema>;

// ---------------------------------------------------------------
// Produtos e variações (campos de texto, como no formulário)
// ---------------------------------------------------------------
const sku = () => optionalText(40);
const optionalUuid = () =>
  z
    .string()
    .trim()
    .transform((v) => (v === "" ? null : v))
    .pipe(z.uuid("Registro inválido.").nullable());

export const productSchema = z
  .object({
    id: z.uuid().optional(),
    name: requiredText(120),
    sku: sku(),
    description: optionalText(2000),
    imagePath: optionalText(300),
    modelSource: z
      .enum([...MODEL_SOURCES, ""])
      .transform((v) => (v === "" ? null : v)),
    modelLicense: optionalText(120),
    modelUrl: z
      .string()
      .trim()
      .max(500, "Máximo 500 caracteres.")
      .refine((v) => v === "" || /^https?:\/\/\S+$/i.test(v), "Use um link começando com http:// ou https://.")
      .transform((v) => (v === "" ? null : v)),
    active: z.boolean(),
    variants: z
      .array(
        z.object({
          id: z.uuid().optional(),
          name: requiredText(80),
          sku: sku(),
          costSheetId: optionalUuid(),
          active: z.boolean(),
          prices: z.array(z.object({ channelId: z.uuid(), price: optionalDecimal({ min: 0, max: 100_000 }) })),
        }),
      )
      .min(1, "Adicione pelo menos uma variação.")
      .max(50, "No máximo 50 variações."),
  })
  .superRefine((p, ctx) => {
    // aviso imediato no formulário; o banco garante o SKU único no catálogo inteiro
    const seen = new Map<string, string>();
    const check = (value: string | null, path: (string | number)[]) => {
      if (!value) return;
      const key = value.toLowerCase();
      if (seen.has(key)) ctx.addIssue({ code: "custom", path, message: `SKU repetido (${seen.get(key)}).` });
      else seen.set(key, path.length === 1 ? "produto" : `variação ${Number(path[1]) + 1}`);
    };
    check(p.sku, ["sku"]);
    p.variants.forEach((v, i) => check(v.sku, ["variants", i, "sku"]));
  });

export type ProductInput = z.input<typeof productSchema>;

/** "Salvar como produto" na calculadora: produto novo ou variação de um existente. */
export const sheetToProductSchema = z.discriminatedUnion("mode", [
  z.object({
    mode: z.literal("new"),
    costSheetId: z.uuid(),
    productName: requiredText(120),
    productSku: sku(),
    variantName: requiredText(80),
  }),
  z.object({
    mode: z.literal("existing"),
    costSheetId: z.uuid(),
    productId: z.uuid("Escolha um produto."),
    variantName: requiredText(80),
    variantSku: sku(),
  }),
]);

export type SheetToProductInput = z.input<typeof sheetToProductSchema>;
