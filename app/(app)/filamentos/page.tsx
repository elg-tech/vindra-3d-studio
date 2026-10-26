import { Spool } from "lucide-react";
import type { Metadata } from "next";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";

export const metadata: Metadata = { title: "Filamentos" };

export default function FilamentosPage() {
  return (
    <div className="grid gap-6">
      <PageHeader title="Filamentos" description="Carretéis, estoque e custo por grama." />
      <EmptyState icon={Spool} title="Em construção" description="O cadastro de carretéis chega na Fase 4." />
    </div>
  );
}
