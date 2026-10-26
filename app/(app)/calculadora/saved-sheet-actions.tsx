"use client";

import { useRouter } from "next/navigation";
import { ConfirmDelete } from "@/components/confirm-delete";
import { deleteCostSheet } from "./actions";

export function ConfirmDeleteSheet({ id, name, isCurrent }: { id: string; name: string; isCurrent: boolean }) {
  const router = useRouter();
  return (
    <ConfirmDelete
      iconOnly
      title={`Excluir a ficha “${name}”?`}
      description="O arquivo .3mf guardado com ela também será apagado. Produtos que usam esta ficha ficam sem custo."
      onConfirm={() => deleteCostSheet(id)}
      onDone={() => {
        if (isCurrent) router.replace("/calculadora");
      }}
    />
  );
}
