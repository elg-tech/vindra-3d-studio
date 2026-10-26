import { z } from "zod";
import { parseDecimal } from "@/lib/numbers";

/**
 * Campos de formulário chegam como texto (aceitando "0,85" ou "1.234,56")
 * e saem como número. O mesmo schema valida no navegador e na Server Action.
 */

type Bounds = { min?: number; max?: number; positive?: boolean; int?: boolean };

function numberSchema({ min, max, positive, int }: Bounds) {
  let n = z.number();
  if (int) n = n.int("Use um número inteiro.");
  if (positive) n = n.positive("Precisa ser maior que zero.");
  if (min !== undefined) n = n.min(min, min === 0 ? "Não pode ser negativo." : `Mínimo ${min}.`);
  if (max !== undefined) n = n.max(max, `Máximo ${max}.`);
  return n;
}

const toNumber = (value: string, ctx: z.RefinementCtx) => {
  const n = parseDecimal(value);
  if (n === null) {
    ctx.addIssue({ code: "custom", message: "Informe um número válido." });
    return z.NEVER;
  }
  return n;
};

/** Número obrigatório. */
export function decimal(bounds: Bounds = {}) {
  return z
    .string()
    .trim()
    .min(1, "Obrigatório.")
    .transform(toNumber)
    .pipe(numberSchema(bounds));
}

/** Número opcional: vazio vira null ("ainda não configurado"). */
export function optionalDecimal(bounds: Bounds = {}) {
  return z
    .string()
    .trim()
    .transform((value, ctx) => (value === "" ? null : toNumber(value, ctx)))
    .pipe(numberSchema(bounds).nullable());
}

/** Percentual de 0 a menos de 100 (10 = 10%). */
export const percent = () => decimal({ min: 0, max: 99.99 });
export const optionalPercent = () => optionalDecimal({ min: 0, max: 99.99 });

/** Texto opcional: vazio vira null. */
export function optionalText(max = 500) {
  return z
    .string()
    .trim()
    .max(max, `Máximo ${max} caracteres.`)
    .transform((v) => (v === "" ? null : v));
}

export const requiredText = (max = 120) =>
  z.string().trim().min(1, "Obrigatório.").max(max, `Máximo ${max} caracteres.`);

export const uuid = () => z.uuid("Registro inválido.");

/** Converte número do banco (ou null) para o texto do campo do formulário. */
export function toField(value: number | null | undefined): string {
  return value === null || value === undefined ? "" : String(value).replace(".", ",");
}
