import { Home } from "lucide-react";
import Link from "next/link";
import { StatusScreen } from "@/components/status-screen";
import { Button } from "@/components/ui/button";

// item que não existe (ou não é seu) dentro do app: mantém o menu
export default function NotFound() {
  return (
    <StatusScreen
      code="404"
      title="Não encontramos isso"
      description="O item pode ter sido excluído ou o link está incompleto."
      actions={
        <Button asChild size="lg">
          <Link href="/dashboard">
            <Home aria-hidden /> Voltar ao início
          </Link>
        </Button>
      }
    />
  );
}
