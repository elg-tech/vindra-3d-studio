"use server";

import { revalidatePath } from "next/cache";
import { type ActionResult, dbError, parseInput } from "@/lib/actions";
import { weighSpool } from "@/lib/filaments";
import { createClient } from "@/lib/supabase/server";
import {
  filamentSchema,
  filamentStatusSchema,
  movementSchema,
  weighSchema,
} from "@/lib/validation/schemas";

function done(message: string, id?: string): ActionResult<{ id: string }> {
  revalidatePath("/filamentos");
  if (id) revalidatePath(`/filamentos/${id}`);
  return { ok: true, message, data: id ? { id } : undefined };
}

export async function saveFilament(input: unknown): Promise<ActionResult<{ id: string }>> {
  const parsed = parseInput(filamentSchema, input);
  if (!parsed.ok) return parsed;
  const { id, ...values } = parsed.data;
  const supabase = await createClient();

  if (!id) {
    // a entrada de estoque é lançada pelo trigger register_filament_purchase
    const { data, error } = await supabase.from("filaments").insert(values).select("id").single();
    if (error) return { ok: false, error: dbError(error) };
    return done("Carretel cadastrado.", data.id);
  }

  const { data: current, error: readError } = await supabase
    .from("filaments")
    .select("net_weight_g")
    .eq("id", id)
    .single();
  if (readError) return { ok: false, error: dbError(readError) };

  const { error } = await supabase.from("filaments").update(values).eq("id", id);
  if (error) return { ok: false, error: dbError(error) };

  // peso líquido corrigido: corrige a entrada, e o trigger ajusta o saldo pela diferença
  if (current.net_weight_g !== values.net_weight_g) {
    const { error: movError } = await supabase
      .from("filament_movements")
      .update({ grams: values.net_weight_g })
      .eq("filament_id", id)
      .eq("kind", "purchase");
    if (movError) return { ok: false, error: dbError(movError) };
  }

  return done("Carretel atualizado.", id);
}

export async function deleteFilament(id: string): Promise<ActionResult> {
  const supabase = await createClient();
  const { error } = await supabase.from("filaments").delete().eq("id", id);
  if (error) return { ok: false, error: dbError(error) };
  revalidatePath("/filamentos");
  return { ok: true, message: "Carretel removido." };
}

export async function weighFilament(input: unknown): Promise<ActionResult<{ id: string }>> {
  const parsed = parseInput(weighSchema, input);
  if (!parsed.ok) return parsed;
  const { id, scale_weight_g, empty_spool_weight_g, save_as_brand_default } = parsed.data;
  const supabase = await createClient();

  const { data: spool, error: readError } = await supabase
    .from("filaments")
    .select("remaining_g, brand_id")
    .eq("id", id)
    .single();
  if (readError) return { ok: false, error: dbError(readError) };

  const { remainingG, adjustmentG } = weighSpool(scale_weight_g, empty_spool_weight_g, spool.remaining_g);

  if (adjustmentG !== 0) {
    const { error } = await supabase.from("filament_movements").insert({
      filament_id: id,
      kind: "adjustment",
      grams: adjustmentG,
      notes: `Pesagem: balança ${scale_weight_g} g − carretel vazio ${empty_spool_weight_g} g = ${remainingG} g`,
    });
    if (error) return { ok: false, error: dbError(error) };
  }

  if (save_as_brand_default && spool.brand_id) {
    const { error } = await supabase
      .from("filament_brands")
      .update({ empty_spool_weight_g })
      .eq("id", spool.brand_id);
    if (error) return { ok: false, error: dbError(error) };
  }

  const sign = adjustmentG > 0 ? "+" : "";
  return done(
    adjustmentG === 0
      ? `Saldo confirmado: ${remainingG} g.`
      : `Saldo corrigido para ${remainingG} g (${sign}${adjustmentG} g).`,
    id,
  );
}

export async function addMovement(input: unknown): Promise<ActionResult<{ id: string }>> {
  const parsed = parseInput(movementSchema, input);
  if (!parsed.ok) return parsed;
  const { id, kind, grams, notes } = parsed.data;
  const supabase = await createClient();

  // falha sempre desconta; ajuste respeita o sinal digitado
  const signed = kind === "failure" ? -Math.abs(grams) : grams;
  const { error } = await supabase
    .from("filament_movements")
    .insert({ filament_id: id, kind, grams: signed, notes });
  if (error) return { ok: false, error: dbError(error) };
  return done(kind === "failure" ? "Falha registrada." : "Ajuste lançado.", id);
}

export async function setFilamentStatus(input: unknown): Promise<ActionResult<{ id: string }>> {
  const parsed = parseInput(filamentStatusSchema, input);
  if (!parsed.ok) return parsed;
  const supabase = await createClient();
  const { error } = await supabase
    .from("filaments")
    .update({ status: parsed.data.status })
    .eq("id", parsed.data.id);
  if (error) return { ok: false, error: dbError(error) };
  return done("Status atualizado.", parsed.data.id);
}
