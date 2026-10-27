import { type NextRequest } from "next/server";
import { cashEntries, currentMonth, entriesCsv, entriesOfMonth, isMonth } from "@/lib/finance";
import { loadFinance } from "@/lib/finance-loaders";
import { createClient } from "@/lib/supabase/server";

/** Lançamentos do mês em CSV para o Excel. O RLS garante que só o dono lê os dados. */
export async function GET(request: NextRequest) {
  const param = request.nextUrl.searchParams.get("mes") ?? undefined;
  const month = isMonth(param) ? param : currentMonth();
  const data = await loadFinance(await createClient());
  const csv = entriesCsv(entriesOfMonth(cashEntries(data), month));
  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="financeiro-${month}.csv"`,
      "Cache-Control": "private, no-store",
    },
  });
}
