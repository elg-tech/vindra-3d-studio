import { FileText } from "lucide-react";
import type { Metadata } from "next";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";

export const metadata: Metadata = { title: "Orçamentos" };

export default function OrcamentosPage() {
  return (
    <div className="grid gap-6">
      <PageHeader title="Orçamentos" description="Crie, envie e acompanhe orçamentos." />
      <EmptyState icon={FileText} title="Em construção" description="Orçamentos, página pública e PDF chegam na Fase 7." />
    </div>
  );
}
