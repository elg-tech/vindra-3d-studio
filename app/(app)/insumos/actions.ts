"use server";

import { revalidatePath } from "next/cache";
import { type ActionResult, dbError, parseInput } from "@/lib/actions";
import { createClient } from "@/lib/supabase/server";
import { supplySchema } from "@/lib/validation/schemas";

export async function saveSupply(input: unknown): Promise<ActionResult> {
  const parsed = parseInput(supplySchema, input);
  if (!parsed.ok) return parsed;
  const { id, ...values } = parsed.data;
  const supabase = await createClient();
  const { error } = id
    ? await supabase.from("supplies").update(values).eq("id", id)
    : await supabase.from("supplies").insert(values);
  if (error) return { ok: false, error: dbError(error) };
  revalidatePath("/insumos");
  return { ok: true, message: id ? "Insumo atualizado." : "Insumo cadastrado." };
}

export async function deleteSupply(id: string): Promise<ActionResult> {
  const supabase = await createClient();
  const { error } = await supabase.from("supplies").delete().eq("id", id);
  if (error) return { ok: false, error: dbError(error) };
  revalidatePath("/insumos");
  return { ok: true, message: "Insumo removido." };
}
