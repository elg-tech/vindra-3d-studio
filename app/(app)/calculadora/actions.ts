"use server";

import { revalidatePath } from "next/cache";
import { type ActionResult, dbError, parseInput } from "@/lib/actions";
import { evaluateSheet } from "@/lib/cost-sheet";
import { loadPricingContext } from "@/lib/pricing-context";
import { createClient, getCurrentUserId } from "@/lib/supabase/server";
import { costSheetSchema } from "@/lib/validation/schemas";

export async function saveCostSheet(input: unknown): Promise<ActionResult<{ id: string }>> {
  const parsed = parseInput(costSheetSchema, input);
  if (!parsed.ok) return parsed;
  const userId = await getCurrentUserId();
  if (!userId) return { ok: false, error: "Sessão expirada. Entre novamente." };
  const sheet = parsed.data;

  // o arquivo .3mf precisa estar na pasta do próprio usuário
  if (sheet.sourceFilePath && !sheet.sourceFilePath.startsWith(`${userId}/`)) {
    return { ok: false, error: "Arquivo inválido." };
  }

  const supabase = await createClient();
  // recalcula no servidor com os dados do banco: não confia no valor do navegador
  const evaluation = evaluateSheet(sheet, await loadPricingContext(supabase));
  if (!evaluation.ok && evaluation.reason === "invalid") return { ok: false, error: evaluation.message };
  // material nunca comprado: salva sem custo em cache (os produtos mostram "sem custo de filamento")
  const unitCost = evaluation.ok ? Math.round(evaluation.result.unit.total * 10_000) / 10_000 : null;

  const { data, error } = await supabase.rpc("save_cost_sheet", {
    p_sheet: sheet,
    // a função grava null em unit_cost; o tipo gerado não expressa argumento nulo
    p_unit_cost: unitCost as number,
  });
  if (error) {
    if (error.message.includes("cost_sheet_not_found")) return { ok: false, error: "Ficha não encontrada." };
    return { ok: false, error: dbError(error) };
  }

  revalidatePath("/calculadora");
  return { ok: true, message: sheet.id ? "Ficha atualizada." : "Ficha salva.", data: { id: data } };
}

export async function deleteCostSheet(id: string): Promise<ActionResult> {
  const supabase = await createClient();
  const { data: sheet } = await supabase.from("cost_sheets").select("source_file_path").eq("id", id).maybeSingle();
  const { error } = await supabase.from("cost_sheets").delete().eq("id", id);
  if (error) return { ok: false, error: dbError(error) };
  if (sheet?.source_file_path) await supabase.storage.from("files").remove([sheet.source_file_path]);
  revalidatePath("/calculadora");
  return { ok: true, message: "Ficha excluída." };
}
