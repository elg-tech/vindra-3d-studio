"use server";

import { revalidatePath } from "next/cache";
import { type ActionResult, dbError, parseInput } from "@/lib/actions";
import { createClient, getCurrentUserId } from "@/lib/supabase/server";
import { productSchema, sheetToProductSchema } from "@/lib/validation/schemas";

type DbError = { code?: string; message: string };

/** SKU repetido vem do trigger check_catalog_sku com a mensagem pronta. */
function productError(error: DbError): string {
  if (error.code === "23505" && error.message.startsWith("SKU")) return error.message;
  if (error.message.includes("product_not_found")) return "Produto não encontrado.";
  if (error.message.includes("variant_not_found")) return "Variação não encontrada. Recarregue a página.";
  return dbError(error);
}

function revalidateCatalog(productId?: string) {
  revalidatePath("/produtos");
  if (productId) revalidatePath(`/produtos/${productId}`);
  revalidatePath("/calculadora");
}

async function removeImage(supabase: Awaited<ReturnType<typeof createClient>>, path: string | null) {
  // melhor esforço: foto órfã não impede salvar nem excluir
  if (path) await supabase.storage.from("product-images").remove([path]);
}

export async function saveProduct(input: unknown): Promise<ActionResult<{ id: string }>> {
  const parsed = parseInput(productSchema, input);
  if (!parsed.ok) return parsed;
  const userId = await getCurrentUserId();
  if (!userId) return { ok: false, error: "Sessão expirada. Entre novamente." };
  const product = parsed.data;

  // a foto precisa estar na pasta do próprio usuário
  if (product.imagePath && !product.imagePath.startsWith(`${userId}/`)) return { ok: false, error: "Foto inválida." };

  const supabase = await createClient();
  let oldImage: string | null = null;
  if (product.id) {
    const { data } = await supabase.from("products").select("image_path").eq("id", product.id).maybeSingle();
    oldImage = data?.image_path ?? null;
  }

  const { data, error } = await supabase.rpc("save_product", { p_product: product });
  if (error) return { ok: false, error: productError(error) };

  if (oldImage && oldImage !== product.imagePath) await removeImage(supabase, oldImage);
  revalidateCatalog(data);
  return { ok: true, message: product.id ? "Produto atualizado." : "Produto criado.", data: { id: data } };
}

export async function deleteProduct(id: string): Promise<ActionResult> {
  const supabase = await createClient();
  const { data: product } = await supabase.from("products").select("image_path").eq("id", id).maybeSingle();
  // variações e preços saem junto (cascade); orçamentos e pedidos guardam nome e preço próprios
  const { error } = await supabase.from("products").delete().eq("id", id);
  if (error) return { ok: false, error: dbError(error) };
  await removeImage(supabase, product?.image_path ?? null);
  revalidateCatalog();
  return { ok: true, message: "Produto excluído." };
}

/** Calculadora → "Salvar como produto": cria o produto ou acrescenta uma variação. */
export async function saveSheetAsProduct(input: unknown): Promise<ActionResult<{ id: string }>> {
  const parsed = parseInput(sheetToProductSchema, input);
  if (!parsed.ok) return parsed;
  const v = parsed.data;
  const supabase = await createClient();

  if (v.mode === "new") {
    const { data, error } = await supabase.rpc("save_product", {
      p_product: {
        name: v.productName,
        sku: v.productSku,
        active: true,
        variants: [{ name: v.variantName, sku: null, costSheetId: v.costSheetId, active: true, prices: [] }],
      },
    });
    if (error) return { ok: false, error: productError(error) };
    revalidateCatalog(data);
    return { ok: true, message: "Produto criado. Defina os preços por canal.", data: { id: data } };
  }

  const { data: last } = await supabase
    .from("product_variants")
    .select("sort_order")
    .eq("product_id", v.productId)
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle();
  const { error } = await supabase.from("product_variants").insert({
    product_id: v.productId,
    name: v.variantName,
    sku: v.variantSku,
    cost_sheet_id: v.costSheetId,
    sort_order: (last?.sort_order ?? -1) + 1,
  });
  if (error) return { ok: false, error: productError(error) };
  revalidateCatalog(v.productId);
  return { ok: true, message: "Variação adicionada. Defina os preços por canal.", data: { id: v.productId } };
}
