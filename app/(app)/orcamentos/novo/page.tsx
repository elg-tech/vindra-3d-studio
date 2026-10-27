import { ArrowLeft } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { defaultValidUntil } from "@/lib/quotes";
import { createClient } from "@/lib/supabase/server";
import { loadEditorData } from "../load-editor";
import { QuoteEditor } from "../quote-editor";

export const metadata: Metadata = { title: "Novo orçamento" };

export default async function NovoOrcamentoPage({ searchParams }: { searchParams: Promise<{ cliente?: string }> }) {
  const { cliente } = await searchParams;
  const supabase = await createClient();
  const data = await loadEditorData(supabase);
  const preselected = data.customers.find((c) => c.id === cliente);

  return (
    <div className="grid gap-6">
      <div className="grid gap-3">
        <Button asChild variant="ghost" size="sm" className="w-fit">
          <Link href="/orcamentos">
            <ArrowLeft aria-hidden /> Orçamentos
          </Link>
        </Button>
        <h1 className="text-2xl font-semibold tracking-tight md:text-3xl">Novo orçamento</h1>
      </div>
      <QuoteEditor
        quote={null}
        initialValues={{
          customerMode: preselected ? "existing" : data.customers.length > 0 ? "existing" : "new",
          customerId: preselected?.id ?? "",
          newCustomerName: "",
          newCustomerWhatsapp: "",
          discountType: "amount",
          discountValue: "0",
          shippingCost: "0",
          productionDays: "",
          validUntil: defaultValidUntil(data.validityDays),
          depositPct: "",
          paymentTerms: "",
          notes: "",
          items: [],
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
