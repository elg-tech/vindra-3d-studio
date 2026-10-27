"use client";

import { Controller } from "react-hook-form";
import { FieldShell, TextAreaField, TextField } from "@/components/form/field";
import { SubmitButton } from "@/components/form/submit-button";
import { useActionForm } from "@/components/form/use-action-form";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PIX_KEY_TYPES, PIX_KEY_TYPE_LABEL, type PixKeyType } from "@/lib/pix";
import type { Tables } from "@/lib/supabase/database.types";
import { toField } from "@/lib/validation/fields";
import { storeSettingsSchema } from "@/lib/validation/schemas";
import { saveStoreSettings } from "./actions";

export function StoreSettingsForm({ settings }: { settings: Tables<"settings"> }) {
  const { form, onSubmit, isPending } = useActionForm({
    schema: storeSettingsSchema,
    action: saveStoreSettings,
    defaultValues: {
      store_name: settings.store_name,
      store_whatsapp: settings.store_whatsapp ?? "",
      store_instagram: settings.store_instagram ?? "",
      store_email: settings.store_email ?? "",
      store_city: settings.store_city ?? "",
      pix_key: settings.pix_key ?? "",
      pix_key_type: (settings.pix_key_type as PixKeyType | null) ?? "",
      default_quote_terms: settings.default_quote_terms ?? "",
      quote_validity_days: toField(settings.quote_validity_days),
    },
  });
  const { register, control, formState } = form;
  const e = formState.errors;

  return (
    <form onSubmit={onSubmit} noValidate>
      <Card>
        <CardHeader>
          <CardTitle>Dados da loja</CardTitle>
          <CardDescription>Aparecem nos orçamentos (página pública e PDF).</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-5 sm:grid-cols-2">
          <TextField label="Nome da loja" registration={register("store_name")} error={e.store_name} />
          <TextField label="Cidade" registration={register("store_city")} error={e.store_city} placeholder="Matão/SP" />
          <TextField
            label="WhatsApp"
            registration={register("store_whatsapp")}
            error={e.store_whatsapp}
            type="tel"
            inputMode="tel"
            placeholder="(16) 99999-9999"
          />
          <TextField
            label="Instagram"
            registration={register("store_instagram")}
            error={e.store_instagram}
            prefix="@"
            placeholder="vindra3d"
          />
          <TextField
            label="E-mail"
            registration={register("store_email")}
            error={e.store_email}
            type="email"
            inputMode="email"
          />
          <FieldShell label="Tipo da chave Pix" error={e.pix_key_type}>
            {({ id, describedBy, invalid }) => (
              <Controller
                control={control}
                name="pix_key_type"
                render={({ field }) => (
                  <Select value={field.value || undefined} onValueChange={field.onChange}>
                    <SelectTrigger id={id} aria-describedby={describedBy} aria-invalid={invalid} className="w-full">
                      <SelectValue placeholder="Escolha o tipo" />
                    </SelectTrigger>
                    <SelectContent>
                      {PIX_KEY_TYPES.map((t) => (
                        <SelectItem key={t} value={t}>
                          {PIX_KEY_TYPE_LABEL[t]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
            )}
          </FieldShell>
          <TextField
            label="Chave Pix"
            registration={register("pix_key")}
            error={e.pix_key}
            hint="Gera o Pix copia e cola e o QR Code com o valor do orçamento (ou do sinal)."
          />
          <TextField
            label="Validade padrão do orçamento"
            registration={register("quote_validity_days")}
            error={e.quote_validity_days}
            numeric
            inputMode="numeric"
            suffix="dias"
          />
          <TextAreaField
            label="Condições padrão do orçamento"
            registration={register("default_quote_terms")}
            error={e.default_quote_terms}
            rows={4}
            placeholder="Ex.: 50% de sinal via Pix para iniciar a produção, restante na entrega."
            className="sm:col-span-2"
          />
        </CardContent>
        <CardFooter className="justify-end">
          <SubmitButton pending={isPending}>Salvar dados da loja</SubmitButton>
        </CardFooter>
      </Card>
    </form>
  );
}
