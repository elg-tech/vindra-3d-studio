"use client";

import { Calculator } from "lucide-react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import type { PricingContext } from "@/lib/cost-sheet";
import type { ItemCost } from "@/lib/item-cost";
import { ItemCostDialog } from "../../calculadora/item-cost-dialog";
import type { SupplyOption } from "../../calculadora/sheet-fields";
import { setOrderItemCost } from "../actions";

/** "Definir custo" / "Editar custo" de um item avulso do pedido: só o custo muda, nunca o preço. */
export function ItemCostButton({
  itemId,
  description,
  quantity,
  unitPrice,
  value,
  hasCost,
  ctx,
  supplies,
}: {
  itemId: string;
  description: string;
  quantity: number;
  unitPrice: number;
  value: ItemCost | null;
  hasCost: boolean;
  ctx: PricingContext;
  supplies: SupplyOption[];
}) {
  const router = useRouter();
  return (
    <ItemCostDialog
      ctx={ctx}
      supplies={supplies}
      description={description}
      quantity={quantity}
      unitPrice={unitPrice}
      value={value}
      onSave={async (cost) => {
        const result = await setOrderItemCost({ itemId, cost });
        if (!result.ok) {
          toast.error(result.error);
          return false;
        }
        toast.success(result.message);
        router.refresh();
        return true;
      }}
      trigger={
        <Button type="button" variant={hasCost ? "ghost" : "outline"} size="sm">
          <Calculator aria-hidden /> {hasCost ? "Editar custo" : "Definir custo"}
        </Button>
      }
    />
  );
}
