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

type Supabase = Awaited<ReturnType<typeof createClient>>;

async function removeImages(supabase: Supabase, paths: (string | null)[]) {
  // melhor esforço: foto órfã não impede salvar nem excluir
  const list = paths.filter((p): p is string => Boolean(p));
  if (list.length) await supabase.storage.from("product-images").remove(list);
}

/** Fotos guardadas hoje: a do produto e as das variações. */
async function storedImages(supabase: Supabase, productId: string): Promise<string[]> {
  const { data } = await supabase
    .from("products")
    .select("image_path, product_variants(image_path)")
    .eq("id", productId)
    .maybeSingle();
  if (!data) return [];
  return [data.image_path, ...data.product_variants.map((v) => v.image_path)].filter((p): p is string => Boolean(p));
}

export async function saveProduct(input: unknown): Promise<ActionResult<{ id: string }>> {
  const parsed = parseInput(productSchema, input);
  if (!parsed.ok) return parsed;
  const userId = await getCurrentUserId();
  if (!userId) return { ok: false, error: "Sessão expirada. Entre novamente." };
  const product = parsed.data;

  // as fotos (produto e variações) precisam estar na pasta do próprio usuário
  const images = [product.imagePath, ...product.variants.map((v) => v.imagePath)].filter((p): p is string => Boolean(p));
  if (images.some((p) => !p.startsWith(`${userId}/`))) return { ok: false, error: "Foto inválida." };

  const supabase = await createClient();
  const oldImages = product.id ? await storedImages(supabase, product.id) : [];

  const { data, error } = await supabase.rpc("save_product", { p_product: product });
  if (error) return { ok: false, error: productError(error) };

  // fotos trocadas, removidas ou de variações excluídas
  await removeImages(supabase, oldImages.filter((p) => !images.includes(p)));
  revalidateCatalog(data);
  return { ok: true, message: product.id ? "Produto atualizado." : "Produto criado.", data: { id: data } };
}

export async function deleteProduct(id: string): Promise<ActionResult> {
  const supabase = await createClient();
  const images = await storedImages(supabase, id);
  // variações e preços saem junto (cascade); orçamentos e pedidos guardam nome e preço próprios
  const { error } = await supabase.from("products").delete().eq("id", id);
  if (error) return { ok: false, error: dbError(error) };
  await removeImages(supabase, images);
  revalidateCatalog();
  return { ok: true, message: "Produto excluído." };
}

/** Calculadora → "Salvar como produto": cria o produto ou acrescenta uma variação (ou uma por kit). */
export async function saveSheetAsProduct(input: unknown): Promise<ActionResult<{ id: string }>> {
  const parsed = parseInput(sheetToProductSchema, input);
  if (!parsed.ok) return parsed;
  const v = parsed.data;
  const supabase = await createClient();

  const kits = v.kits?.length ? v.kits : null;
  const hasPrices = kits?.some((k) => k.prices.length > 0) ?? false;
  if (v.mode === "new") {
    const variants = kits
      ? kits.map((k) => ({
          name: k.name,
          sku: null,
          costSheetId: v.costSheetId,
          piecesPerKit: k.piecesPerKit,
          active: true,
          prices: k.prices,
        }))
      : [{ name: v.variantName, sku: null, costSheetId: v.costSheetId, piecesPerKit: 1, active: true, prices: [] }];
    const { data, error } = await supabase.rpc("save_product", {
      p_product: { name: v.productName, sku: v.productSku, active: true, variants },
    });
    if (error) return { ok: false, error: productError(error) };
    revalidateCatalog(data);
    return {
      ok: true,
      message: hasPrices ? "Produto criado com os preços digitados." : "Produto criado. Defina os preços por canal.",
      data: { id: data },
    };
  }

  const { data: last } = await supabase
    .from("product_variants")
    .select("sort_order")
    .eq("product_id", v.productId)
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle();
  const start = (last?.sort_order ?? -1) + 1;
  const rows = kits
    ? kits.map((k, i) => ({
        product_id: v.productId,
        name: k.name,
        sku: null,
        cost_sheet_id: v.costSheetId,
        pieces_per_kit: k.piecesPerKit,
        sort_order: start + i,
      }))
    : [{ product_id: v.productId, name: v.variantName, sku: v.variantSku, cost_sheet_id: v.costSheetId, sort_order: start }];
  const { data: inserted, error } = await supabase.from("product_variants").insert(rows).select("id, sort_order");
  if (error) return { ok: false, error: productError(error) };
  if (kits && hasPrices) {
    const bySort = new Map((inserted ?? []).map((r) => [r.sort_order, r.id]));
    const prices = kits.flatMap((k, i) =>
      k.prices.map((p) => ({ variant_id: bySort.get(start + i) as string, channel_id: p.channelId, price: p.price })),
    );
    const { error: priceError } = await supabase.from("variant_channel_prices").insert(prices);
    if (priceError) return { ok: false, error: productError(priceError) };
  }
  revalidateCatalog(v.productId);
  return {
    ok: true,
    message: kits
      ? `${kits.length} variações adicionadas.${hasPrices ? "" : " Defina os preços por canal."}`
      : "Variação adicionada. Defina os preços por canal.",
    data: { id: v.productId },
  };
}
