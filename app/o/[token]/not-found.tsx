import type { Metadata } from "next";
import { StatusScreen } from "@/components/status-screen";

export const metadata: Metadata = { title: "Orçamento não encontrado" };

// visto pelo cliente: nada de link para o painel
export default function QuoteNotFound() {
  return (
    <StatusScreen
      fullScreen
      code="404"
      title="Orçamento não encontrado"
      description="O link pode estar incompleto ou o orçamento foi removido. Peça um link novo para a loja."
      actions={null}
    />
  );
}
