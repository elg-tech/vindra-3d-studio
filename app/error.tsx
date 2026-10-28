"use client";

import { Home, RotateCcw } from "lucide-react";
import Link from "next/link";
import { StatusScreen } from "@/components/status-screen";
import { Button } from "@/components/ui/button";

// erro fora do layout do app (login): o de dentro do app fica em app/(app)/error.tsx
export default function RootError({ retry }: { error: unknown; retry: () => void }) {
  return (
    <StatusScreen
      fullScreen
      title="Algo deu errado"
      description="Não foi possível carregar esta página. Tente de novo em instantes."
      actions={
        <>
          <Button size="lg" onClick={() => retry()}>
            <RotateCcw aria-hidden /> Tentar de novo
          </Button>
          <Button asChild variant="outline" size="lg">
            <Link href="/">
              <Home aria-hidden /> Voltar ao início
            </Link>
          </Button>
        </>
      }
    />
  );
}
