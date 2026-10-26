import { Package } from "lucide-react";
import type { Metadata } from "next";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";

export const metadata: Metadata = { title: "Produtos" };

export default function ProdutosPage() {
  return (
    <div className="grid gap-6">
      <PageHeader title="Produtos" description="Catálogo, variações e lucro por canal." />
      <EmptyState icon={Package} title="Em construção" description="O catálogo de produtos chega na Fase 6." />
    </div>
  );
}
