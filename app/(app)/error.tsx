"use client";

import { Home, RotateCcw } from "lucide-react";
import Link from "next/link";
import { StatusScreen } from "@/components/status-screen";
import { Button } from "@/components/ui/button";

export default function AppError({ error, retry }: { error: unknown; retry: () => void }) {
  const digest = error instanceof Error && "digest" in error ? String(error.digest) : null;
  return (
    <StatusScreen
      title="Algo deu errado"
      description={`Não foi possível carregar esta página. Tente de novo; se continuar, recarregue o app.${digest ? ` Código: ${digest}.` : ""}`}
      actions={
        <>
          <Button size="lg" onClick={() => retry()}>
            <RotateCcw aria-hidden /> Tentar de novo
          </Button>
          <Button asChild variant="outline" size="lg">
            <Link href="/dashboard">
              <Home aria-hidden /> Voltar ao início
            </Link>
          </Button>
        </>
      }
    />
  );
}
