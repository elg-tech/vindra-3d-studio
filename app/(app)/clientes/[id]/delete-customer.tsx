"use client";

import { useRouter } from "next/navigation";
import { ConfirmDelete } from "@/components/confirm-delete";
import { deleteCustomer } from "../actions";

export function ConfirmDeleteCustomer({ id, name }: { id: string; name: string }) {
  const router = useRouter();
  return (
    <ConfirmDelete
      title={`Excluir ${name}?`}
      description="Os orçamentos continuam salvos, sem cliente."
      onConfirm={() => deleteCustomer(id)}
      onDone={() => router.push("/clientes")}
    />
  );
}
