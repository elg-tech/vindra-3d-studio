"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useState, useTransition } from "react";
import { type DefaultValues, type FieldValues, type Path, type Resolver, useForm } from "react-hook-form";
import { toast } from "sonner";
import type { z } from "zod";
import type { ActionResult } from "@/lib/actions";

export type UnusualConfirmation = {
  warnings: string[];
  onConfirm: () => void;
  onCancel: () => void;
};

/**
 * Formulário validado com zod no navegador que envia os valores (texto) para uma
 * Server Action, que valida de novo com o mesmo schema. Mostra toast e erros por campo.
 * Com `checkUnusual`, valores fora do normal pedem confirmação antes de salvar.
 */
export function useActionForm<S extends z.ZodType<unknown, FieldValues>, R = undefined>({
  schema,
  defaultValues,
  action,
  onSuccess,
  checkUnusual,
}: {
  schema: S;
  defaultValues: DefaultValues<z.input<S>>;
  action: (values: z.input<S>) => Promise<ActionResult<R>>;
  onSuccess?: (data: R | undefined) => void;
  checkUnusual?: (values: z.input<S>) => string[];
}) {
  const [isPending, startTransition] = useTransition();
  const [pendingWarnings, setPendingWarnings] = useState<string[]>([]);
  const form = useForm<z.input<S>, unknown, z.output<S>>({
    // o zodResolver não consegue inferir tipos a partir de um schema genérico
    resolver: zodResolver(schema as never) as Resolver<z.input<S>, unknown, z.output<S>>,
    defaultValues,
  });

  // envia os valores originais (texto): o servidor faz o parse
  const send = () => {
    const values = form.getValues();
    startTransition(async () => {
      const result = await action(values);
      if (result.ok) {
        if (result.message) toast.success(result.message);
        onSuccess?.(result.data);
        return;
      }
      toast.error(result.error);
      for (const [name, message] of Object.entries(result.fieldErrors ?? {})) {
        form.setError(name as Path<z.input<S>>, { message });
      }
    });
  };

  const onSubmit = form.handleSubmit(() => {
    const warnings = checkUnusual?.(form.getValues()) ?? [];
    if (warnings.length > 0) setPendingWarnings(warnings);
    else send();
  });

  const confirmation: UnusualConfirmation = {
    warnings: pendingWarnings,
    onConfirm: () => {
      setPendingWarnings([]);
      send();
    },
    onCancel: () => setPendingWarnings([]),
  };

  return { form, onSubmit, isPending, confirmation };
}
