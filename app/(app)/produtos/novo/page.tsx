import { ArrowLeft } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Button } from "@/components/ui/button";
import { loadSheets } from "@/lib/catalog";
import { loadPricingContext } from "@/lib/pricing-context";
import { createClient, getCurrentUserId } from "@/lib/supabase/server";
import { ProductForm } from "../product-form";

export const metadata: Metadata = { title: "Novo produto" };

export default async function NovoProdutoPage() {
  const userId = await getCurrentUserId();
  if (!userId) redirect("/login");
  const supabase = await createClient();
  const [ctx, sheets] = await Promise.all([loadPricingContext(supabase), loadSheets(supabase)]);

  return (
    <div className="grid gap-6">
      <div className="grid gap-3">
        <Button asChild variant="ghost" size="sm" className="w-fit">
          <Link href="/produtos">
            <ArrowLeft aria-hidden /> Produtos
          </Link>
        </Button>
        <h1 className="text-2xl font-semibold tracking-tight md:text-3xl">Novo produto</h1>
      </div>
      <ProductForm product={null} sheets={sheets} ctx={ctx} userId={userId} />
    </div>
  );
}
