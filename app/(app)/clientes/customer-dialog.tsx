"use client";

import { Pencil, UserPlus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { TextAreaField, TextField } from "@/components/form/field";
import { SubmitButton } from "@/components/form/submit-button";
import { useActionForm } from "@/components/form/use-action-form";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import type { Tables } from "@/lib/supabase/database.types";
import { customerSchema } from "@/lib/validation/schemas";
import { saveCustomer } from "./actions";

type Customer = Pick<Tables<"customers">, "id" | "name" | "whatsapp" | "instagram" | "email" | "city" | "notes">;

/** "Novo cliente" ou "Editar" em um diálogo. */
export function CustomerDialog({ customer }: { customer?: Customer }) {
  const [open, setOpen] = useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {customer ? (
          <Button variant="outline" size="sm">
            <Pencil aria-hidden /> Editar
          </Button>
        ) : (
          <Button>
            <UserPlus aria-hidden /> Novo cliente
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
        {open && <CustomerForm customer={customer ?? null} onDone={() => setOpen(false)} />}
      </DialogContent>
    </Dialog>
  );
}

function CustomerForm({ customer, onDone }: { customer: Customer | null; onDone: () => void }) {
  const router = useRouter();
  const { form, onSubmit, isPending } = useActionForm({
    schema: customerSchema,
    action: saveCustomer,
    onSuccess: (data) => {
      onDone();
      if (!customer && data?.id) router.push(`/clientes/${data.id}`);
    },
    defaultValues: {
      id: customer?.id,
      name: customer?.name ?? "",
      whatsapp: customer?.whatsapp ?? "",
      instagram: customer?.instagram ?? "",
      email: customer?.email ?? "",
      city: customer?.city ?? "",
      notes: customer?.notes ?? "",
    },
  });
  const { register, formState } = form;
  const e = formState.errors;

  return (
    <form onSubmit={onSubmit} noValidate className="grid gap-5">
      <DialogHeader>
        <DialogTitle>{customer ? "Editar cliente" : "Novo cliente"}</DialogTitle>
        <DialogDescription>O WhatsApp é usado para enviar orçamentos com um toque.</DialogDescription>
      </DialogHeader>
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField label="Nome" registration={register("name")} error={e.name} className="sm:col-span-2" />
        <TextField
          label="WhatsApp"
          registration={register("whatsapp")}
          error={e.whatsapp}
          type="tel"
          inputMode="tel"
          placeholder="(16) 99999-9999"
        />
        <TextField label="Instagram" registration={register("instagram")} error={e.instagram} prefix="@" />
        <TextField label="E-mail" registration={register("email")} error={e.email} type="email" inputMode="email" />
        <TextField label="Cidade" registration={register("city")} error={e.city} />
        <TextAreaField label="Observações" registration={register("notes")} error={e.notes} rows={3} className="sm:col-span-2" />
      </div>
      <DialogFooter>
        <SubmitButton pending={isPending}>{customer ? "Salvar" : "Cadastrar"}</SubmitButton>
      </DialogFooter>
    </form>
  );
}
