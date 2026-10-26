"use server";

import { revalidatePath } from "next/cache";
import { type ActionResult, dbError, parseInput } from "@/lib/actions";
import { toCostInput } from "@/lib/cost-sheet";
import { PricingInputError, calculateCost } from "@/lib/pricing";
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
  let unitCost: number;
  try {
    // recalcula no servidor com os dados do banco: não confia no valor do navegador
    const ctx = await loadPricingContext(supabase);
    unitCost = calculateCost(toCostInput(sheet, ctx)).unit.total;
  } catch (error) {
    if (error instanceof PricingInputError) return { ok: false, error: error.message };
    throw error;
  }

  const { data, error } = await supabase.rpc("save_cost_sheet", {
    p_sheet: sheet,
    p_unit_cost: Math.round(unitCost * 10_000) / 10_000,
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
