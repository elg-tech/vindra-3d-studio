import { MessageCircle, Search, Users } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { formatCurrency, formatPhone } from "@/lib/format";
import { summarizeQuoteRow } from "@/lib/quote-rows";
import { createClient } from "@/lib/supabase/server";
import { CustomerDialog } from "./customer-dialog";

export const metadata: Metadata = { title: "Clientes" };

export default async function ClientesPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { q: rawQuery } = await searchParams;
  const q = (rawQuery ?? "").trim().toLowerCase();
  const supabase = await createClient();
  const { data: customers, error } = await supabase
    .from("customers")
    .select(
      "id, name, whatsapp, instagram, city, quotes(id, number, status, valid_until, discount_type, discount_value, shipping_cost, deposit_pct, quote_items(quantity, unit_price))",
    )
    .order("name");
  if (error) throw new Error("Não foi possível carregar os clientes.");

  const digits = q.replace(/\D/g, "");
  const visible = customers.filter(
    (c) =>
      !q ||
      c.name.toLowerCase().includes(q) ||
      c.instagram?.toLowerCase().includes(q.replace(/^@/, "")) ||
      (digits.length >= 4 && c.whatsapp?.includes(digits)),
  );

  return (
    <div className="grid gap-6">
      <PageHeader title="Clientes" description="Contatos e histórico de orçamentos." actions={<CustomerDialog />} />

      {customers.length === 0 ? (
        <EmptyState
          icon={Users}
          title="Nenhum cliente ainda"
          description="Cadastre aqui ou direto no orçamento, só com nome e WhatsApp."
          action={<CustomerDialog />}
        />
      ) : (
        <>
          <form role="search" className="relative max-w-sm">
            <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
            <Input
              type="search"
              name="q"
              defaultValue={rawQuery ?? ""}
              placeholder="Buscar por nome, WhatsApp ou Instagram"
              aria-label="Buscar clientes"
              className="pl-8"
            />
          </form>

          {visible.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhum cliente encontrado.</p>
          ) : (
            <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {visible.map((c) => {
                const summaries = c.quotes.map(summarizeQuoteRow);
                const approved = summaries.filter((s) => s.status === "approved").reduce((sum, s) => sum + s.total, 0);
                return (
                  <li key={c.id}>
                    <Card className="h-full gap-0 py-0 transition-colors hover:border-ring/60">
                      <Link
                        href={`/clientes/${c.id}`}
                        className="grid gap-1 p-4 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                      >
                        <p className="truncate font-medium">{c.name}</p>
                        <p className="flex items-center gap-1.5 truncate text-sm text-muted-foreground">
                          {c.whatsapp && <MessageCircle className="size-3.5 shrink-0" aria-hidden />}
                          {[formatPhone(c.whatsapp), c.city].filter(Boolean).join(" · ") || "Sem contato"}
                        </p>
                        <p className="text-xs text-muted-foreground tabular-nums">
                          {c.quotes.length} orçamento(s)
                          {approved > 0 && ` · ${formatCurrency(approved)} aprovados`}
                        </p>
                      </Link>
                    </Card>
                  </li>
                );
              })}
            </ul>
          )}
        </>
      )}
    </div>
  );
}
