import { Users } from "lucide-react";
import type { Metadata } from "next";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";

export const metadata: Metadata = { title: "Clientes" };

export default function ClientesPage() {
  return (
    <div className="grid gap-6">
      <PageHeader title="Clientes" description="Contatos e histórico de compras." />
      <EmptyState icon={Users} title="Em construção" description="O cadastro de clientes chega na Fase 7." />
    </div>
  );
}
