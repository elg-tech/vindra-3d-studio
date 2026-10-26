import { Wallet } from "lucide-react";
import type { Metadata } from "next";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";

export const metadata: Metadata = { title: "Financeiro" };

export default function FinanceiroPage() {
  return (
    <div className="grid gap-6">
      <PageHeader title="Financeiro" description="Receitas, despesas e DRE do mês." />
      <EmptyState icon={Wallet} title="Em construção" description="O financeiro chega na Fase 9." />
    </div>
  );
}
