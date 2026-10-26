import { LayoutDashboard } from "lucide-react";
import type { Metadata } from "next";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";

export const metadata: Metadata = { title: "Dashboard" };

export default function DashboardPage() {
  return (
    <div className="grid gap-6">
      <PageHeader title="Dashboard" description="Resumo do mês da Vindra 3D." />
      <EmptyState icon={LayoutDashboard} title="Em construção" description="Os KPIs, gráficos e alertas chegam na Fase 9." />
    </div>
  );
}
