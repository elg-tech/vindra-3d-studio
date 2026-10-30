import { z } from "zod";
import { MATERIALS } from "@/lib/filaments";
import { requiredText } from "./fields";

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

/**
 * Custo de um item avulso (sem produto nem ficha): mini calculadora (a ficha, sem nome) ou manual.
 * Manual: custo + mão de obra = custo por peça; a mão de obra é a parte de hora de trabalho.
 */
export const itemCostSchema = z.discriminatedUnion("source", [
  z.object({
    source: z.literal("calc"),
    sheet: costSheetSchema.pick({
      printerId: true,
      printMinutes: true,
      prepMinutes: true,
      postMinutes: true,
      purgeG: true,
      packagingCost: true,
      quantity: true,
      piecesPerPlate: true,
      filaments: true,
      extras: true,
    }),
  }),
  z.object({
    source: z.literal("manual"),
    cost: z.number().min(0, "Não pode ser negativo.").max(100_000),
    labor: z.number().min(0, "Não pode ser negativo.").max(100_000),
  }),
]);

export type ItemCostSchemaInput = z.input<typeof itemCostSchema>;

/** "Definir custo" de um item de pedido existente; cost null = remover o custo. */
export const orderItemCostSchema = z.object({
  itemId: z.uuid(),
  cost: itemCostSchema.nullable(),
});
