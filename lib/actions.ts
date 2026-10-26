import type { z } from "zod";

/** Resultado padrão das Server Actions, exibido como toast no cliente. */
export type ActionResult<T = undefined> =
  | { ok: true; data?: T; message?: string }
  | { ok: false; error: string; fieldErrors?: Record<string, string> };

/** Valida a entrada com zod; em caso de erro, devolve a primeira mensagem de cada campo. */
export function parseInput<S extends z.ZodType>(
  schema: S,
  input: unknown,
): { ok: true; data: z.output<S> } | { ok: false; error: string; fieldErrors: Record<string, string> } {
  const parsed = schema.safeParse(input);
  if (parsed.success) return { ok: true, data: parsed.data };

  const fieldErrors: Record<string, string> = {};
  for (const issue of parsed.error.issues) {
    const key = issue.path.join(".");
    fieldErrors[key] ??= issue.message;
  }
  return { ok: false, error: "Confira os campos destacados.", fieldErrors };
}

/** Traduz erros do Postgres/PostgREST para mensagens úteis. */
export function dbError(error: { code?: string; message: string }): string {
  if (error.code === "23505") return "Já existe um registro com esses dados.";
  if (error.code === "23503") return "Este registro está em uso e não pode ser removido.";
  if (error.code === "23514") return "Algum valor está fora do permitido.";
  if (error.code === "42501") return "Sem permissão para esta ação.";
  return "Não foi possível salvar. Tente novamente.";
}
