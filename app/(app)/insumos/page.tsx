import type { Metadata } from "next";
import { PageHeader } from "@/components/page-header";
import { createClient } from "@/lib/supabase/server";
import { SuppliesList } from "./supplies-list";

export const metadata: Metadata = { title: "Insumos" };

export default async function InsumosPage() {
  const supabase = await createClient();
  const { data, error } = await supabase.from("supplies").select("*").order("is_packaging").order("name");
  if (error) throw new Error("Não foi possível carregar os insumos.");

  return (
    <div className="grid gap-6">
      <PageHeader
        title="Insumos"
        description="Embalagens, argolas, ímãs, parafusos, cola, tinta… reutilizados na calculadora."
      />
      <SuppliesList supplies={data ?? []} />
    </div>
  );
}
