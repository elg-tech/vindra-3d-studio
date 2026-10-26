import { Calculator } from "lucide-react";
import type { Metadata } from "next";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";

export const metadata: Metadata = { title: "Calculadora" };

export default function CalculadoraPage() {
  return (
    <div className="grid gap-6">
      <PageHeader title="Calculadora" description="Custo real e preço por canal de cada peça." />
      <EmptyState icon={Calculator} title="Em construção" description="A calculadora e a importação do .3mf chegam na Fase 5." />
    </div>
  );
}
