"use client";

import { RotateCcw } from "lucide-react";
import { StatusScreen } from "@/components/status-screen";
import { Button } from "@/components/ui/button";

export default function QuoteError({ retry }: { error: unknown; retry: () => void }) {
  return (
    <StatusScreen
      fullScreen
      title="Não foi possível abrir o orçamento"
      description="Tente de novo em instantes. Se continuar, fale com a loja pelo WhatsApp."
      actions={
        <Button size="lg" onClick={() => retry()}>
          <RotateCcw aria-hidden /> Tentar de novo
        </Button>
      }
    />
  );
}
