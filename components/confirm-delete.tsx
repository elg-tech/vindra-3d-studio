"use client";

import { Trash2 } from "lucide-react";
import { useTransition } from "react";
import { toast } from "sonner";
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
import type { ActionResult } from "@/lib/actions";

/** Botão de excluir com confirmação. */
export function ConfirmDelete({
  title,
  description,
  onConfirm,
  onDone,
  label = "Excluir",
  iconOnly,
}: {
  title: string;
  description: string;
  onConfirm: () => Promise<ActionResult<unknown>>;
  onDone?: () => void;
  label?: string;
  iconOnly?: boolean;
}) {
  const [isPending, startTransition] = useTransition();

  const confirm = () =>
    startTransition(async () => {
      const result = await onConfirm();
      if (result.ok) {
        toast.success(result.message ?? "Removido.");
        onDone?.();
      } else {
        toast.error(result.error);
      }
    });

  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size={iconOnly ? "icon" : "sm"}
          className="text-destructive hover:text-destructive"
          aria-label={iconOnly ? label : undefined}
          disabled={isPending}
        >
          <Trash2 aria-hidden />
          {!iconOnly && label}
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancelar</AlertDialogCancel>
          <AlertDialogAction variant="destructive" onClick={confirm}>
            {label}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
