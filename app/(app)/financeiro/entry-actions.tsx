"use client";

import { ConfirmDelete } from "@/components/confirm-delete";
import type { ManualTransaction } from "@/lib/finance";
import { deleteTransaction } from "./actions";
import { TransactionDialog } from "./transaction-dialog";

/** Editar e excluir um lançamento manual. */
export function EntryActions({ transaction }: { transaction: ManualTransaction }) {
  return (
    <div className="flex shrink-0 items-center">
      <TransactionDialog transaction={transaction} />
      <ConfirmDelete
        iconOnly
        title="Excluir lançamento?"
        description="Ele sai do caixa e do DRE do mês."
        onConfirm={() => deleteTransaction(transaction.id)}
      />
    </div>
  );
}
