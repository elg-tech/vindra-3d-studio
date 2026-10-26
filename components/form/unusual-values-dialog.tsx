"use client";

import { AlertTriangle } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import type { UnusualConfirmation } from "./use-action-form";

/** Confirmação de valores fora do normal (aviso, não bloqueio). */
export function UnusualValuesDialog({ warnings, onConfirm, onCancel }: UnusualConfirmation) {
  return (
    <AlertDialog open={warnings.length > 0} onOpenChange={(open) => !open && onCancel()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2">
            <AlertTriangle className="size-5 text-warning" aria-hidden />
            Confira os valores
          </AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="grid gap-2">
              <p>Estes valores estão fora do normal. Pode ser erro de digitação:</p>
              <ul className="list-disc space-y-1 pl-5 text-foreground">
                {warnings.map((w) => (
                  <li key={w}>{w}</li>
                ))}
              </ul>
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Corrigir</AlertDialogCancel>
          <AlertDialogAction onClick={onConfirm}>Está certo, salvar</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
