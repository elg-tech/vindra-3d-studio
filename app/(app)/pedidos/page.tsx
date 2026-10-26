import { ClipboardList } from "lucide-react";
import type { Metadata } from "next";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";

export const metadata: Metadata = { title: "Pedidos" };

export default function PedidosPage() {
  return (
    <div className="grid gap-6">
      <PageHeader title="Pedidos" description="Produção em kanban, do pagamento à entrega." />
      <EmptyState icon={ClipboardList} title="Em construção" description="O kanban de produção chega na Fase 8." />
    </div>
  );
}
