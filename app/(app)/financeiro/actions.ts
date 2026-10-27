"use server";

import { revalidatePath } from "next/cache";
import { type ActionResult, dbError, parseInput } from "@/lib/actions";
import { createClient } from "@/lib/supabase/server";
import { transactionSchema } from "@/lib/validation/schemas";

function revalidateFinance() {
  revalidatePath("/financeiro");
  revalidatePath("/dashboard");
}

/** Lançamento manual (despesa ou outra receita). Receitas de pedido e carretéis se editam na origem. */
export async function saveTransaction(input: unknown): Promise<ActionResult> {
  const parsed = parseInput(transactionSchema, input);
  if (!parsed.ok) return parsed;
  const { id, kind, category, description, amount, occurredOn, isFixed } = parsed.data;
  const values = { kind, category, description, gross_amount: amount, occurred_on: occurredOn, is_fixed: isFixed };
  const supabase = await createClient();

  if (id) {
    const { data, error } = await supabase.from("transactions").update(values).eq("id", id).select("id");
    if (error) return { ok: false, error: dbError(error) };
    if (data.length === 0) return { ok: false, error: "Lançamento não encontrado." };
    revalidateFinance();
    return { ok: true, message: "Lançamento atualizado." };
  }

  const { error } = await supabase.from("transactions").insert(values);
  if (error) return { ok: false, error: dbError(error) };
  revalidateFinance();
  return { ok: true, message: kind === "income" ? "Receita lançada." : "Despesa lançada." };
}

export async function deleteTransaction(id: string): Promise<ActionResult> {
  const supabase = await createClient();
  const { error } = await supabase.from("transactions").delete().eq("id", id);
  if (error) return { ok: false, error: dbError(error) };
  revalidateFinance();
  return { ok: true, message: "Lançamento excluído." };
}
