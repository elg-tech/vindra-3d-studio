import { ArrowLeft } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/server";
import { loadManualOrderData } from "./load";
import { ManualOrderForm } from "./manual-order-form";

export const metadata: Metadata = { title: "Novo pedido" };

export default async function NovoPedidoPage() {
  const supabase = await createClient();
  const data = await loadManualOrderData(supabase);

  return (
    <div className="grid gap-6">
      <div className="grid gap-3">
        <Button asChild variant="ghost" size="sm" className="w-fit">
          <Link href="/pedidos">
            <ArrowLeft aria-hidden /> Pedidos
          </Link>
        </Button>
        <h1 className="text-2xl font-semibold tracking-tight md:text-3xl">Novo pedido</h1>
        <p className="text-sm text-muted-foreground">
          Venda da Shopee, do TikTok ou direta sem orçamento. Para um orçamento aprovado, use &ldquo;Converter em pedido&rdquo; nele.
        </p>
      </div>
      <ManualOrderForm
        channels={data.channels}
        customers={data.customers}
        options={data.options}
        ctx={data.ctx}
        supplies={data.supplies}
      />
    </div>
  );
}
