import { ArrowLeft } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Button } from "@/components/ui/button";
import { loadSheets } from "@/lib/catalog";
import { loadPricingContext } from "@/lib/pricing-context";
import { createClient, getCurrentUserId } from "@/lib/supabase/server";
import { ProductForm } from "../product-form";

const isUuid = (id: string) => /^[0-9a-f-]{36}$/i.test(id);

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  if (!isUuid(id)) return { title: "Produto" };
  const supabase = await createClient();
  const { data } = await supabase.from("products").select("name").eq("id", id).maybeSingle();
  return { title: data?.name ?? "Produto" };
}

export default async function ProdutoPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!isUuid(id)) notFound();
  const userId = await getCurrentUserId();
  if (!userId) redirect("/login");

  const supabase = await createClient();
  const [ctx, sheets, { data: p }] = await Promise.all([
    loadPricingContext(supabase),
    loadSheets(supabase),
    supabase
      .from("products")
      .select(
        "id, name, sku, description, image_path, model_source, model_license, model_url, active, product_variants(id, name, sku, image_path, cost_sheet_id, active, sort_order, variant_channel_prices(channel_id, price))",
      )
      .eq("id", id)
      .maybeSingle(),
  ]);
  if (!p) notFound();

  const { product_variants, ...product } = p;
  const variants = [...product_variants]
    .sort((a, b) => a.sort_order - b.sort_order)
    .map(({ variant_channel_prices, ...v }) => ({ ...v, prices: variant_channel_prices }));

  return (
    <div className="grid gap-6">
      <div className="grid gap-3">
        <Button asChild variant="ghost" size="sm" className="w-fit">
          <Link href="/produtos">
            <ArrowLeft aria-hidden /> Produtos
          </Link>
        </Button>
        <h1 className="text-2xl font-semibold tracking-tight md:text-3xl">{product.name}</h1>
      </div>
      {/* key: depois de salvar, o formulário recomeça com os dados do banco */}
      <ProductForm key={JSON.stringify(p)} product={{ ...product, variants }} sheets={sheets} ctx={ctx} userId={userId} />
    </div>
  );
}
