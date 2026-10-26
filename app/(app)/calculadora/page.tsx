import { Calculator as CalculatorIcon } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { type CalcFormValues, sheetToForm } from "@/lib/calculator-form";
import { sheetFromRow } from "@/lib/cost-sheet";
import { formatCurrency, formatDate } from "@/lib/format";
import { loadPricingContext } from "@/lib/pricing-context";
import { createClient, getCurrentUserId } from "@/lib/supabase/server";
import { Calculator } from "./calculator";
import { ConfirmDeleteSheet } from "./saved-sheet-actions";

export const metadata: Metadata = { title: "Calculadora" };

export default async function CalculadoraPage({
  searchParams,
}: {
  searchParams: Promise<{ ficha?: string }>;
}) {
  const { ficha } = await searchParams;
  const userId = await getCurrentUserId();
  if (!userId) redirect("/login");

  const supabase = await createClient();
  const [ctx, supplies, sheets] = await Promise.all([
    loadPricingContext(supabase),
    supabase.from("supplies").select("id, name, unit, unit_cost, is_packaging").order("name"),
    supabase
      .from("cost_sheets")
      .select("id, name, unit_cost, quantity, updated_at")
      .order("updated_at", { ascending: false })
      .limit(30),
  ]);

  let initial: CalcFormValues | null = null;
  if (ficha) {
    if (!/^[0-9a-f-]{36}$/i.test(ficha)) notFound();
    const { data: s } = await supabase
      .from("cost_sheets")
      .select("*, cost_sheet_filaments(*), cost_sheet_supplies(*)")
      .eq("id", ficha)
      .maybeSingle();
    if (!s) notFound();
    initial = sheetToForm({
      ...sheetFromRow(s),
      id: s.id,
      name: s.name,
      notes: s.notes,
      sourceFilePath: s.source_file_path,
    });
  }

  return (
    <div className="grid gap-6">
      <PageHeader
        title="Calculadora"
        description="Custo real da peça e preço por canal. Importe o .3mf do Bambu Studio ou preencha à mão."
      />

      {/* key: trocar de ficha recria o formulário com os valores dela */}
      <Calculator key={ficha ?? "nova"} ctx={ctx} supplies={supplies.data ?? []} initial={initial} userId={userId} />

      <Card>
        <CardHeader>
          <CardTitle>Fichas salvas</CardTitle>
        </CardHeader>
        <CardContent>
          {(sheets.data ?? []).length === 0 ? (
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              <CalculatorIcon className="size-4" aria-hidden />
              Nenhuma ficha ainda. Calcule uma peça e clique em &ldquo;Salvar ficha&rdquo;.
            </p>
          ) : (
            <ul className="divide-y">
              {sheets.data?.map((s) => (
                <li key={s.id} className="flex items-center gap-3 py-2">
                  <Link
                    href={`/calculadora?ficha=${s.id}`}
                    className="min-w-0 flex-1 rounded-md hover:underline focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                    aria-current={s.id === ficha ? "page" : undefined}
                  >
                    <span className="block truncate font-medium">{s.name}</span>
                    <span className="text-xs text-muted-foreground">Atualizada em {formatDate(s.updated_at)}</span>
                  </Link>
                  <span className="text-right text-sm tabular-nums">
                    {s.unit_cost === null ? "—" : formatCurrency(s.unit_cost)}
                    <span className="block text-xs text-muted-foreground">por peça</span>
                  </span>
                  <ConfirmDeleteSheet id={s.id} name={s.name} isCurrent={s.id === ficha} />
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
