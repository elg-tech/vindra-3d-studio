import { Settings } from "lucide-react";
import type { Metadata } from "next";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";

export const metadata: Metadata = { title: "Configurações" };

export default function ConfiguracoesPage() {
  return (
    <div className="grid gap-6">
      <PageHeader title="Configurações" description="Impressoras, taxas, energia e dados da loja." />
      <EmptyState icon={Settings} title="Em construção" description="As configurações chegam na Fase 4." />
    </div>
  );
}
