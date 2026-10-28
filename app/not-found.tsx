import { Home } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { StatusScreen } from "@/components/status-screen";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = { title: "Página não encontrada" };

export default function NotFound() {
  return (
    <StatusScreen
      fullScreen
      code="404"
      title="Página não encontrada"
      description="O endereço pode estar errado ou a página foi removida."
      actions={
        <Button asChild size="lg">
          <Link href="/">
            <Home aria-hidden /> Voltar ao início
          </Link>
        </Button>
      }
    />
  );
}
