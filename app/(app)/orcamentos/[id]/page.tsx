import { ArrowLeft } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Button } from "@/components/ui/button";
import { type QuoteStatus, effectiveStatus } from "@/lib/quotes";
import { createClient } from "@/lib/supabase/server";
import { toField } from "@/lib/validation/fields";
import { loadEditorData } from "../load-editor";
import { QuoteEditor } from "../quote-editor";

const isUuid = (id: string) => /^[0-9a-f-]{36}$/i.test(id);
const money = (n: number) => n.toFixed(2).replace(".", ",");

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  if (!isUuid(id)) return { title: "Orçamento" };
  const supabase = await createClient();
  const { data } = await supabase.from("quotes").select("number").eq("id", id).maybeSingle();
  return { title: data?.number ?? "Orçamento" };
}

export default async function OrcamentoPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!isUuid(id)) notFound();
  const supabase = await createClient();
  const [data, { data: q }] = await Promise.all([
    loadEditorData(supabase),
    supabase.from("quotes").select("*, quote_items(*)").eq("id", id).maybeSingle(),
  ]);
  if (!q) notFound();

  return (
    <div className="grid gap-6">
      <div className="grid gap-3">
        <Button asChild variant="ghost" size="sm" className="w-fit">
          <Link href="/orcamentos">
            <ArrowLeft aria-hidden /> Orçamentos
          </Link>
        </Button>
        <h1 className="text-2xl font-semibold tracking-tight tabular-nums md:text-3xl">Orçamento {q.number}</h1>
      </div>
      {/* key: depois de salvar, o formulário recomeça com os dados do banco (e a nova revisão) */}
      <QuoteEditor
        key={`${q.revision}-${q.status}`}
        quote={{
          id: q.id,
          number: q.number,
          token: q.token,
          status: effectiveStatus(q.status as QuoteStatus, q.valid_until),
          approvedAt: q.approved_at,
          rejectedAt: q.rejected_at,
        }}
        initialValues={{
          id: q.id,
          customerMode: q.customer_id ? "existing" : "none",
          customerId: q.customer_id ?? "",
          newCustomerName: "",
          newCustomerWhatsapp: "",
          discountType: q.discount_type as "amount" | "percent",
          discountValue: toField(q.discount_value),
          shippingCost: toField(q.shipping_cost),
          productionDays: toField(q.production_days),
          validUntil: q.valid_until ?? "",
          depositPct: toField(q.deposit_pct),
          paymentTerms: q.payment_terms ?? "",
          notes: q.notes ?? "",
          items: [...q.quote_items]
            .sort((a, b) => a.sort_order - b.sort_order)
            .map((i) => ({
              variantId: i.variant_id ?? "",
              costSheetId: i.variant_id ? "" : (i.cost_sheet_id ?? ""),
              description: i.description,
              quantity: String(i.quantity),
              unitPrice: money(i.unit_price),
            })),
        }}
        customers={data.customers}
        catalog={data.catalog.options}
        directFees={data.catalog.directFees}
        taxPct={data.catalog.taxPct}
        storeName={data.storeName}
        siteUrl={data.siteUrl}
        warnings={data.warnings}
      />
    </div>
  );
}
