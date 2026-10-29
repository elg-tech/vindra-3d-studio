"use client";

import { Calculator, ImagePlus, Plus, Trash2, X } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { Controller, useFieldArray, useWatch } from "react-hook-form";
import { toast } from "sonner";
import { ConfirmDelete } from "@/components/confirm-delete";
import { FieldShell, TextAreaField, TextField } from "@/components/form/field";
import { SubmitButton } from "@/components/form/submit-button";
import { useActionForm } from "@/components/form/use-action-form";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import type { PricingContext, SheetData } from "@/lib/cost-sheet";
import { formatCurrency, formatNumber } from "@/lib/format";
import { resizeToWebp } from "@/lib/image-resize";
import { parseDecimal } from "@/lib/numbers";
import { type ChannelPricing, priceVariant } from "@/lib/product-pricing";
import { MODEL_SOURCE_LABEL, MODEL_SOURCES, productImageUrl } from "@/lib/products";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import { type ProductInput, productSchema } from "@/lib/validation/schemas";
import { deleteProduct, saveProduct } from "./actions";
import { StatusBadge } from "./status-badge";

const NONE = "none";

export type ProductFormSheet = { id: string; name: string; sheet: SheetData };

export type ProductFormProduct = {
  id: string;
  name: string;
  sku: string | null;
  description: string | null;
  image_path: string | null;
  model_source: string | null;
  model_license: string | null;
  model_url: string | null;
  active: boolean;
  variants: {
    id: string;
    name: string;
    sku: string | null;
    image_path: string | null;
    cost_sheet_id: string | null;
    active: boolean;
    prices: { channel_id: string; price: number }[];
  }[];
};

type VariantValues = ProductInput["variants"][number];

// preço sempre com centavos: 39.9 do banco aparece como "39,90"
const priceField = (n: number | undefined) => (n === undefined ? "" : n.toFixed(2).replace(".", ","));
const pct = (n: number) => `${formatNumber(Math.round(n * 10) / 10)}%`;

export function ProductForm({
  product,
  sheets,
  ctx,
  userId,
}: {
  product: ProductFormProduct | null;
  sheets: ProductFormSheet[];
  ctx: PricingContext;
  userId: string;
}) {
  const router = useRouter();
  const emptyPrices = () => ctx.channels.map((c) => ({ channelId: c.id, price: "" }));
  const newVariant = (name = ""): VariantValues => ({
    name,
    sku: "",
    imagePath: "",
    costSheetId: "",
    active: true,
    prices: emptyPrices(),
  });

  const { form, onSubmit, isPending } = useActionForm({
    schema: productSchema,
    action: saveProduct,
    onSuccess: (data) => {
      if (!product && data?.id) router.push(`/produtos/${data.id}`);
      else router.refresh();
    },
    defaultValues: {
      id: product?.id,
      name: product?.name ?? "",
      sku: product?.sku ?? "",
      description: product?.description ?? "",
      imagePath: product?.image_path ?? "",
      modelSource: (product?.model_source as ProductInput["modelSource"] | null) ?? "",
      modelLicense: product?.model_license ?? "",
      modelUrl: product?.model_url ?? "",
      active: product?.active ?? true,
      variants: product?.variants.length
        ? product.variants.map((v) => ({
            id: v.id,
            name: v.name,
            sku: v.sku ?? "",
            imagePath: v.image_path ?? "",
            costSheetId: v.cost_sheet_id ?? "",
            active: v.active,
            // um campo por canal ativo, na ordem dos canais
            prices: ctx.channels.map((c) => ({
              channelId: c.id,
              price: priceField(v.prices.find((p) => p.channel_id === c.id)?.price),
            })),
          }))
        : [newVariant("Padrão")],
    },
  });
  const { control, register, setValue, formState } = form;
  const e = formState.errors;
  const variants = useFieldArray({ control, name: "variants", keyName: "key" });
  const imagePath = useWatch({ control, name: "imagePath" }) ?? "";

  return (
    <form onSubmit={onSubmit} noValidate className="grid gap-4 lg:grid-cols-[minmax(0,22rem)_minmax(0,1fr)] lg:items-start">
      <div className="grid gap-4">
        <Card>
          <CardHeader>
            <CardTitle>Produto</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4">
            <PhotoField
              label="Foto do produto"
              initialPath={product?.image_path ?? null}
              path={imagePath}
              userId={userId}
              onChange={(path) => setValue("imagePath", path, { shouldDirty: true })}
            />
            <TextField label="Nome" registration={register("name")} error={e.name} placeholder="ex.: Suporte de controle" />
            <TextField
              label="SKU"
              registration={register("sku")}
              error={e.sku}
              hint="Opcional. Único no catálogo (produtos e variações)."
              autoCapitalize="characters"
            />
            <TextAreaField label="Descrição" registration={register("description")} error={e.description} rows={3} />
            <div className="flex items-center justify-between gap-3">
              <Label htmlFor="product-active">Ativo no catálogo</Label>
              <Controller
                control={control}
                name="active"
                render={({ field }) => (
                  <Switch id="product-active" checked={field.value} onCheckedChange={field.onChange} />
                )}
              />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Origem do modelo 3D</CardTitle>
            <CardDescription>Autoria e licença, para saber se pode vender.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4">
            <FieldShell label="Origem" error={e.modelSource}>
              {({ id }) => (
                <Controller
                  control={control}
                  name="modelSource"
                  render={({ field }) => (
                    <Select
                      value={field.value === "" ? NONE : field.value}
                      onValueChange={(v) => field.onChange(v === NONE ? "" : v)}
                    >
                      <SelectTrigger id={id} className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={NONE}>Não informada</SelectItem>
                        {MODEL_SOURCES.map((s) => (
                          <SelectItem key={s} value={s}>
                            {MODEL_SOURCE_LABEL[s]}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                />
              )}
            </FieldShell>
            <TextField
              label="Licença"
              registration={register("modelLicense")}
              error={e.modelLicense}
              placeholder="ex.: CC BY 4.0, uso comercial pago"
            />
            <TextField
              label="Link do modelo"
              registration={register("modelUrl")}
              error={e.modelUrl}
              type="url"
              inputMode="url"
              placeholder="https://"
            />
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4">
        {e.variants?.root?.message && (
          <p role="alert" className="text-sm text-destructive">
            {e.variants.root.message}
          </p>
        )}
        {variants.fields.map((v, i) => {
          const savedImage = product?.variants.find((pv) => pv.id === v.id)?.image_path ?? null;
          return (
            <VariantCard
              key={v.key}
              index={i}
              form={form}
              sheets={sheets}
              ctx={ctx}
              userId={userId}
              savedImage={savedImage}
              canRemove={variants.fields.length > 1}
              onRemove={async () => {
                // foto enviada e ainda não salva sai junto; a já salva sai ao salvar o produto
                await discardUnsavedPhoto(form.getValues(`variants.${i}.imagePath`) ?? "", savedImage);
                variants.remove(i);
              }}
            />
          );
        })}
        <Button type="button" variant="outline" onClick={() => variants.append(newVariant())} className="w-fit">
          <Plus aria-hidden /> Adicionar variação
        </Button>

        <Card className="sticky bottom-[calc(4.5rem+env(safe-area-inset-bottom))] z-20 py-3 lg:bottom-4">
          <CardContent className="flex flex-wrap items-center gap-2 px-4">
            <SubmitButton pending={isPending} className="flex-1 sm:flex-none">
              {product ? "Salvar alterações" : "Criar produto"}
            </SubmitButton>
            <Button type="button" variant="outline" asChild>
              <Link href="/produtos">Cancelar</Link>
            </Button>
            {product && (
              <div className="ml-auto">
                <ConfirmDelete
                  title={`Excluir ${product.name}?`}
                  description="As variações e os preços saem junto. As fichas de custo continuam na calculadora."
                  onConfirm={() => deleteProduct(product.id)}
                  onDone={() => router.push("/produtos")}
                />
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </form>
  );
}

type Form = ReturnType<typeof useActionForm<typeof productSchema, { id: string }>>["form"];

function VariantCard({
  index: i,
  form,
  sheets,
  ctx,
  userId,
  savedImage,
  canRemove,
  onRemove,
}: {
  index: number;
  form: Form;
  sheets: ProductFormSheet[];
  ctx: PricingContext;
  userId: string;
  savedImage: string | null;
  canRemove: boolean;
  onRemove: () => void;
}) {
  const { control, register, setValue, formState } = form;
  const e = formState.errors.variants?.[i];
  const values = useWatch({ control, name: `variants.${i}` });

  // lucro ao vivo: mesma conta da lista de produtos (lib/product-pricing.ts)
  const sheet = sheets.find((s) => s.id === values.costSheetId)?.sheet ?? null;
  const prices = Object.fromEntries((values.prices ?? []).map((p) => [p.channelId, parseDecimal(p.price ?? "")]));
  const pricing = priceVariant(sheet, prices, ctx);

  return (
    <Card className={cn(!values.active && "opacity-70")}>
      <CardHeader>
        <CardTitle className="flex items-center justify-between gap-2 text-base">
          <span className="truncate">{values.name?.trim() || `Variação ${i + 1}`}</span>
          {canRemove && (
            <Button type="button" variant="ghost" size="icon" onClick={onRemove} aria-label={`Remover variação ${i + 1}`}>
              <Trash2 aria-hidden />
            </Button>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="grid gap-4">
        <PhotoField
          label="Foto da variação"
          hint="Opcional. Sem foto, o orçamento e a página do cliente usam a foto do produto."
          compact
          initialPath={savedImage}
          path={values.imagePath ?? ""}
          userId={userId}
          onChange={(path) => setValue(`variants.${i}.imagePath`, path, { shouldDirty: true })}
        />
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField
            label="Nome da variação"
            registration={register(`variants.${i}.name`)}
            error={e?.name}
            placeholder="ex.: Xbox, PS5, Tamanho M"
          />
          <TextField label="SKU" registration={register(`variants.${i}.sku`)} error={e?.sku} autoCapitalize="characters" />
        </div>

        <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
          <FieldShell
            label="Ficha de custo"
            error={e?.costSheetId}
            className="min-w-0"
            hint={
              pricing.unitCost !== null ? (
                <span className="tabular-nums">Custo por peça hoje: {formatCurrency(pricing.unitCost)}</span>
              ) : undefined
            }
          >
            {({ id, describedBy }) => (
              <Controller
                control={control}
                name={`variants.${i}.costSheetId`}
                render={({ field }) => (
                  <Select
                    value={field.value === "" ? NONE : field.value}
                    onValueChange={(v) => field.onChange(v === NONE ? "" : v)}
                  >
                    <SelectTrigger
                      id={id}
                      aria-describedby={describedBy}
                      className="w-full min-w-0 *:data-[slot=select-value]:block *:data-[slot=select-value]:truncate"
                    >
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={NONE}>Sem ficha</SelectItem>
                      {sheets.map((s) => (
                        <SelectItem key={s.id} value={s.id}>
                          {s.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
            )}
          </FieldShell>
          <div className="flex items-center gap-3 sm:pb-1.5">
            {values.costSheetId && (
              <Button type="button" variant="ghost" size="sm" asChild>
                <Link href={`/calculadora?ficha=${values.costSheetId}`}>
                  <Calculator aria-hidden /> Abrir ficha
                </Link>
              </Button>
            )}
            <Label htmlFor={`variant-active-${i}`} className="text-sm font-normal">
              Ativa
            </Label>
            <Controller
              control={control}
              name={`variants.${i}.active`}
              render={({ field }) => (
                <Switch id={`variant-active-${i}`} checked={field.value} onCheckedChange={field.onChange} />
              )}
            />
          </div>
        </div>

        {pricing.warnings.length > 0 && (
          <ul className="grid gap-1 rounded-lg border border-warning/40 bg-warning/10 p-3 text-xs">
            {pricing.warnings.map((w) => (
              <li key={w}>{w}</li>
            ))}
          </ul>
        )}

        <fieldset className="grid gap-2">
          <legend className="mb-1 text-sm font-medium">Preço por canal</legend>
          {ctx.channels.length === 0 && (
            <p className="text-sm text-muted-foreground">Nenhum canal ativo. Configure em Configurações → Canais.</p>
          )}
          {ctx.channels.map((c, ci) => (
            <ChannelRow
              key={c.id}
              name={c.name}
              inputId={`price-${i}-${c.id}`}
              registration={register(`variants.${i}.prices.${ci}.price`)}
              error={e?.prices?.[ci]?.price?.message}
              pricing={pricing.channels[ci]}
              onUseSuggested={(price) =>
                setValue(`variants.${i}.prices.${ci}.price`, priceField(price), { shouldDirty: true })
              }
            />
          ))}
        </fieldset>
      </CardContent>
    </Card>
  );
}

function ChannelRow({
  name,
  inputId,
  registration,
  error,
  pricing,
  onUseSuggested,
}: {
  name: string;
  inputId: string;
  registration: ReturnType<Form["register"]>;
  error?: string;
  pricing: ChannelPricing;
  onUseSuggested: (price: number) => void;
}) {
  const { profit, suggested } = pricing;
  return (
    <div className="grid gap-2 rounded-lg border p-3 sm:grid-cols-[9rem_8rem_minmax(0,1fr)] sm:items-center">
      <div className="flex items-center justify-between gap-2 sm:block">
        <Label htmlFor={inputId} className="truncate">
          {name}
        </Label>
        <StatusBadge status={pricing.status} className="sm:hidden" />
      </div>
      <div className="relative">
        <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-sm text-muted-foreground">
          R$
        </span>
        <Input
          id={inputId}
          inputMode="decimal"
          autoComplete="off"
          placeholder="—"
          aria-invalid={Boolean(error)}
          className="pl-10 tabular-nums"
          {...registration}
        />
      </div>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
        <StatusBadge status={pricing.status} className="hidden sm:inline-flex" />
        {profit && (
          <span
            className={cn(
              "tabular-nums",
              profit.profit < 0 ? "text-destructive" : pricing.status === "below_min" ? "text-warning" : "text-success",
            )}
          >
            lucro {formatCurrency(profit.profit)} ({pct(profit.marginPct)})
          </span>
        )}
        {suggested?.ok && (
          <span className="flex items-center gap-1 text-muted-foreground tabular-nums">
            sugerido {formatCurrency(suggested.price)}
            {suggested.price !== pricing.price && (
              <Button type="button" variant="link" size="sm" className="h-auto p-0" onClick={() => onUseSuggested(suggested.price)}>
                usar
              </Button>
            )}
          </span>
        )}
        {suggested && !suggested.ok && <span className="text-destructive">{suggested.error}</span>}
        {pricing.creditProfit && (
          <span className="text-muted-foreground tabular-nums">
            no crédito: lucro {formatCurrency(pricing.creditProfit.profit)}
          </span>
        )}
        {error && <span className="w-full text-xs text-destructive">{error}</span>}
      </div>
    </div>
  );
}

/** Apaga do Storage uma foto enviada nesta edição que ainda não foi salva. */
async function discardUnsavedPhoto(current: string, initialPath: string | null) {
  if (current && current !== initialPath) await createClient().storage.from("product-images").remove([current]);
}

/**
 * Foto do produto ou da variação: reduz no navegador e envia na hora para product-images/<usuário>/produtos/.
 * Uma foto enviada e trocada antes de salvar é apagada; a foto antiga só sai ao salvar (no servidor).
 */
function PhotoField({
  label = "Foto",
  hint = "Reduzida para até 1600 px antes de enviar.",
  compact,
  initialPath,
  path,
  userId,
  onChange,
}: {
  label?: string;
  hint?: string;
  compact?: boolean;
  initialPath: string | null;
  path: string;
  userId: string;
  onChange: (path: string) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const url = productImageUrl(path || null);
  const discardUnsaved = (current: string) => discardUnsavedPhoto(current, initialPath);

  async function onFile(file: File | undefined) {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast.error("Escolha uma imagem (JPG, PNG ou WebP).");
      return;
    }
    setUploading(true);
    try {
      const blob = await resizeToWebp(file);
      const newPath = `${userId}/produtos/${crypto.randomUUID()}.webp`;
      const { error } = await createClient()
        .storage.from("product-images")
        .upload(newPath, blob, { contentType: "image/webp", cacheControl: "31536000" });
      if (error) throw error;
      await discardUnsaved(path);
      onChange(newPath);
    } catch {
      toast.error("Não foi possível enviar a foto.");
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return (
    <div className="grid gap-1.5">
      <span className="text-sm font-medium">{label}</span>
      <div className="flex items-center gap-3">
        <div className={cn("relative shrink-0 overflow-hidden rounded-lg border bg-muted", compact ? "size-16" : "size-24")}>
          {url ? (
            <Image src={url} alt={label} fill sizes={compact ? "64px" : "96px"} className="object-cover" />
          ) : (
            <ImagePlus className="absolute inset-0 m-auto size-6 text-muted-foreground" aria-hidden />
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" size="sm" disabled={uploading} onClick={() => inputRef.current?.click()}>
            <ImagePlus aria-hidden /> {uploading ? "Enviando…" : url ? "Trocar" : "Escolher foto"}
          </Button>
          {url && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={uploading}
              onClick={async () => {
                await discardUnsaved(path);
                onChange("");
              }}
            >
              <X aria-hidden /> Remover
            </Button>
          )}
        </div>
        <input
          ref={inputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          className="sr-only"
          tabIndex={-1}
          aria-label={`Escolher ${label.toLowerCase()}`}
          onChange={(ev) => onFile(ev.target.files?.[0])}
        />
      </div>
      <p className="text-xs text-muted-foreground">{hint}</p>
    </div>
  );
}
