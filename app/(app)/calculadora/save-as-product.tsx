"use client";

import { Loader2, PackagePlus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useId, useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { saveSheetAsProduct } from "../produtos/actions";

export type ProductOption = { id: string; name: string };

/** Um kit da calculadora, com os preços manuais digitados (viram os preços da variação). */
export type KitDraft = { name: string; piecesPerKit: number; prices: { channelId: string; price: number }[] };

/**
 * "Salvar como produto": a ficha salva vira um produto novo ou uma variação de um existente.
 * Com kits na calculadora, pode criar uma variação por kit (mesma ficha, peças por kit e preços digitados).
 */
export function SaveAsProduct({
  sheetId,
  sheetName,
  products,
  kits = [],
}: {
  sheetId: string;
  sheetName: string;
  products: ProductOption[];
  kits?: KitDraft[];
}) {
  const hasKits = kits.some((k) => k.piecesPerKit > 1);
  const [perKit, setPerKit] = useState(true);
  const useKits = hasKits && perKit;
  const router = useRouter();
  const id = useId();
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<"new" | "existing">("new");
  const [productName, setProductName] = useState(sheetName);
  const [productSku, setProductSku] = useState("");
  const [variantName, setVariantName] = useState("Padrão");
  const [productId, setProductId] = useState("");
  const [existingVariantName, setExistingVariantName] = useState(sheetName);
  const [variantSku, setVariantSku] = useState("");
  const [isPending, startTransition] = useTransition();

  function onOpenChange(next: boolean) {
    setOpen(next);
    if (next) {
      setProductName(sheetName);
      setExistingVariantName(sheetName);
    }
  }

  function submit(e: React.FormEvent) {
    // o diálogo fica dentro do formulário da calculadora: sem isto o submit também salvaria a ficha
    e.preventDefault();
    e.stopPropagation();
    startTransition(async () => {
      const result = await saveSheetAsProduct(
        mode === "new"
          ? { mode, costSheetId: sheetId, productName, productSku, variantName, kits: useKits ? kits : undefined }
          : {
              mode,
              costSheetId: sheetId,
              productId,
              variantName: existingVariantName,
              variantSku,
              kits: useKits ? kits : undefined,
            },
      );
      if (!result.ok) {
        toast.error(Object.values(result.fieldErrors ?? {})[0] ?? result.error);
        return;
      }
      toast.success(result.message);
      setOpen(false);
      if (result.data) router.push(`/produtos/${result.data.id}`);
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>
        <Button type="button" variant="outline">
          <PackagePlus aria-hidden /> Salvar como produto
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <form onSubmit={submit} className="grid gap-5">
          <DialogHeader>
            <DialogTitle>Salvar como produto</DialogTitle>
            <DialogDescription>
              Usa a versão salva da ficha. Os preços por canal você define na página do produto
              {hasKits && " (ou já vão os preços manuais digitados em cada kit)"}.
            </DialogDescription>
          </DialogHeader>

          {hasKits && (
            <label className="flex min-h-11 cursor-pointer items-start gap-3 rounded-lg border p-3 text-sm">
              <input
                type="checkbox"
                className="mt-0.5 size-4 shrink-0 accent-primary"
                checked={perKit}
                onChange={(e) => setPerKit(e.target.checked)}
              />
              <span>
                Uma variação por kit: {kits.map((k) => k.name).join(", ")}
                <span className="block text-xs text-muted-foreground">
                  Mesma ficha, com as peças por kit e os preços manuais digitados.
                </span>
              </span>
            </label>
          )}

          <Tabs value={mode} onValueChange={(v) => setMode(v as "new" | "existing")}>
            <TabsList className="w-full">
              <TabsTrigger value="new">Produto novo</TabsTrigger>
              <TabsTrigger value="existing" disabled={products.length === 0}>
                Variação de um existente
              </TabsTrigger>
            </TabsList>
            <TabsContent value="new" className="grid gap-4 pt-3">
              <div className="grid gap-1.5">
                <Label htmlFor={`${id}-pname`}>Nome do produto</Label>
                <Input id={`${id}-pname`} value={productName} onChange={(e) => setProductName(e.target.value)} required />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor={`${id}-psku`}>SKU (opcional)</Label>
                <Input id={`${id}-psku`} value={productSku} onChange={(e) => setProductSku(e.target.value)} />
              </div>
              {!useKits && (
                <div className="grid gap-1.5">
                  <Label htmlFor={`${id}-vname`}>Nome da primeira variação</Label>
                  <Input id={`${id}-vname`} value={variantName} onChange={(e) => setVariantName(e.target.value)} required />
                </div>
              )}
            </TabsContent>
            <TabsContent value="existing" className="grid gap-4 pt-3">
              <div className="grid gap-1.5">
                <Label htmlFor={`${id}-product`}>Produto</Label>
                <Select value={productId} onValueChange={setProductId}>
                  <SelectTrigger id={`${id}-product`} className="w-full">
                    <SelectValue placeholder="Escolha o produto" />
                  </SelectTrigger>
                  <SelectContent>
                    {products.map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {!useKits && (
              <>
              <div className="grid gap-1.5">
                <Label htmlFor={`${id}-ename`}>Nome da variação</Label>
                <Input
                  id={`${id}-ename`}
                  value={existingVariantName}
                  onChange={(e) => setExistingVariantName(e.target.value)}
                  placeholder="ex.: PS5"
                  required
                />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor={`${id}-esku`}>SKU da variação (opcional)</Label>
                <Input id={`${id}-esku`} value={variantSku} onChange={(e) => setVariantSku(e.target.value)} />
              </div>
              </>
              )}
            </TabsContent>
          </Tabs>

          <DialogFooter>
            <Button type="submit" disabled={isPending || (mode === "existing" && !productId)}>
              {isPending && <Loader2 className="animate-spin" aria-hidden />}
              {mode === "new" ? "Criar produto" : useKits ? "Adicionar variações" : "Adicionar variação"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
