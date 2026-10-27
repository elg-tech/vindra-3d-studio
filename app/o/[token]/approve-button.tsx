"use client";

import { CheckCircle2, Loader2, RefreshCw } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { approveQuote } from "./actions";

/** Aprovar exige clique e confirmação; envia a revisão que esta página mostrou. */
export function ApproveButton({
  token,
  revision,
  number,
  totalLabel,
}: {
  token: string;
  revision: number;
  number: string;
  totalLabel: string;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [problem, setProblem] = useState<{ code: string; message: string } | null>(null);

  const approve = () =>
    startTransition(async () => {
      const result = await approveQuote(token, revision);
      if (result.ok) {
        setProblem(null);
        router.refresh();
      } else {
        setProblem(result);
      }
    });

  return (
    <div className="grid gap-2">
      <AlertDialog>
        <AlertDialogTrigger asChild>
          <Button size="lg" className="h-12 w-full text-base" disabled={isPending}>
            {isPending ? <Loader2 className="animate-spin" aria-hidden /> : <CheckCircle2 aria-hidden />}
            Aprovar orçamento
          </Button>
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Aprovar o orçamento {number}?</AlertDialogTitle>
            <AlertDialogDescription>
              Total de {totalLabel}. A loja recebe a aprovação e combina com você o pagamento e a produção.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Voltar</AlertDialogCancel>
            <AlertDialogAction onClick={approve}>Aprovar</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      {problem && (
        <div role="alert" className="grid gap-2 rounded-lg border border-warning/40 bg-warning/10 p-3 text-sm">
          <p>{problem.message}</p>
          {problem.code === "quote_outdated" && (
            <Button type="button" variant="outline" size="sm" className="w-fit" onClick={() => window.location.reload()}>
              <RefreshCw aria-hidden /> Recarregar
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
