"use server";

import { revalidatePath } from "next/cache";
import { type ActionResult, dbError, parseInput } from "@/lib/actions";
import { createClient } from "@/lib/supabase/server";
import { customerSchema } from "@/lib/validation/schemas";

export async function saveCustomer(input: unknown): Promise<ActionResult<{ id: string }>> {
  const parsed = parseInput(customerSchema, input);
  if (!parsed.ok) return parsed;
  const { id, ...values } = parsed.data;
  const supabase = await createClient();

  if (id) {
    const { error } = await supabase.from("customers").update(values).eq("id", id);
    if (error) return { ok: false, error: dbError(error) };
    revalidatePath("/clientes");
    revalidatePath(`/clientes/${id}`);
    return { ok: true, message: "Cliente atualizado.", data: { id } };
  }

  const { data, error } = await supabase.from("customers").insert(values).select("id").single();
  if (error) return { ok: false, error: dbError(error) };
  revalidatePath("/clientes");
  return { ok: true, message: "Cliente cadastrado.", data: { id: data.id } };
}

export async function deleteCustomer(id: string): Promise<ActionResult> {
  const supabase = await createClient();
  // orçamentos ficam, sem cliente (on delete set null)
  const { error } = await supabase.from("customers").delete().eq("id", id);
  if (error) return { ok: false, error: dbError(error) };
  revalidatePath("/clientes");
  revalidatePath("/orcamentos");
  return { ok: true, message: "Cliente excluído." };
}
