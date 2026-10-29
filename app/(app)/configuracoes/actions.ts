"use server";

import { revalidatePath } from "next/cache";
import { type ActionResult, dbError, parseInput } from "@/lib/actions";
import type { TablesUpdate } from "@/lib/supabase/database.types";
import { createClient, getCurrentUserId } from "@/lib/supabase/server";
import {
  brandSchema,
  channelSchema,
  costSettingsSchema,
  directChannelSchema,
  printerSchema,
  storeSettingsSchema,
} from "@/lib/validation/schemas";

const NOT_LOGGED_IN: ActionResult = { ok: false, error: "Sessão expirada. Entre novamente." };

function done(message: string): ActionResult {
  revalidatePath("/configuracoes");
  return { ok: true, message };
}

async function updateSettings(values: TablesUpdate<"settings">, message: string): Promise<ActionResult> {
  const userId = await getCurrentUserId();
  if (!userId) return NOT_LOGGED_IN;
  const supabase = await createClient();
  const { error } = await supabase.from("settings").update(values).eq("owner_id", userId);
  if (error) return { ok: false, error: dbError(error) };
  return done(message);
}

export async function saveCostSettings(input: unknown): Promise<ActionResult> {
  const parsed = parseInput(costSettingsSchema, input);
  if (!parsed.ok) return parsed;
  return updateSettings(parsed.data, "Custos salvos.");
}

export async function saveStoreSettings(input: unknown): Promise<ActionResult> {
  const parsed = parseInput(storeSettingsSchema, input);
  if (!parsed.ok) return parsed;
  return updateSettings(parsed.data, "Dados da loja salvos.");
}

export async function saveChannel(input: unknown): Promise<ActionResult> {
  const parsed = parseInput(channelSchema, input);
  if (!parsed.ok) return parsed;
  const { id, ...values } = parsed.data;
  const supabase = await createClient();
  const { error } = await supabase.from("sales_channels").update(values).eq("id", id);
  if (error) return { ok: false, error: dbError(error) };
  return done("Taxas do canal salvas.");
}

export async function saveDirectChannel(input: unknown): Promise<ActionResult> {
  const parsed = parseInput(directChannelSchema, input);
  if (!parsed.ok) return parsed;
  const { id, ...values } = parsed.data;
  const supabase = await createClient();
  const { error } = await supabase.from("sales_channels").update(values).eq("id", id).eq("kind", "direct");
  if (error) return { ok: false, error: dbError(error) };
  return done("Taxas da venda direta salvas.");
}

export async function savePrinter(input: unknown): Promise<ActionResult> {
  const parsed = parseInput(printerSchema, input);
  if (!parsed.ok) return parsed;
  const userId = await getCurrentUserId();
  if (!userId) return NOT_LOGGED_IN;
  const { id, ...values } = parsed.data;
  const supabase = await createClient();

  // só pode haver uma impressora padrão
  if (values.is_default) {
    const { error } = await supabase
      .from("printers")
      .update({ is_default: false })
      .eq("owner_id", userId)
      .neq("id", id ?? "00000000-0000-0000-0000-000000000000");
    if (error) return { ok: false, error: dbError(error) };
  }

  const { error } = id
    ? await supabase.from("printers").update(values).eq("id", id)
    : await supabase.from("printers").insert(values);
  if (error) return { ok: false, error: dbError(error) };
  return done(id ? "Impressora atualizada." : "Impressora cadastrada.");
}

export async function deletePrinter(id: string): Promise<ActionResult> {
  const supabase = await createClient();
  const { error } = await supabase.from("printers").delete().eq("id", id);
  if (error) return { ok: false, error: dbError(error) };
  return done("Impressora removida.");
}

export async function saveBrand(input: unknown): Promise<ActionResult> {
  const parsed = parseInput(brandSchema, input);
  if (!parsed.ok) return parsed;
  const { id, ...values } = parsed.data;
  const supabase = await createClient();
  const { error } = id
    ? await supabase.from("filament_brands").update(values).eq("id", id)
    : await supabase.from("filament_brands").insert(values);
  if (error) return { ok: false, error: dbError(error) };
  revalidatePath("/filamentos");
  return done(id ? "Marca atualizada." : "Marca cadastrada.");
}

export async function deleteBrand(id: string): Promise<ActionResult> {
  const supabase = await createClient();
  const { error } = await supabase.from("filament_brands").delete().eq("id", id);
  if (error) return { ok: false, error: dbError(error) };
  revalidatePath("/filamentos");
  return done("Marca removida.");
}
