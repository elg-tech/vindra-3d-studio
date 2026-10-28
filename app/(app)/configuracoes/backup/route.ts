import { BACKUP_TABLES, type BackupData, type Row, backupFileName, buildBackupZip } from "@/lib/backup";
import { createClient, getCurrentUserId } from "@/lib/supabase/server";

const PAGE = 1000; // limite de linhas por consulta do Supabase

/** Todos os dados do usuário logado num .zip. O RLS garante que só as linhas dele saem. */
export async function GET() {
  if (!(await getCurrentUserId())) return new Response("Faça login de novo.", { status: 401 });
  const supabase = await createClient();

  const data = {} as BackupData;
  for (const { name, order } of BACKUP_TABLES) {
    const rows: Row[] = [];
    for (let from = 0; ; from += PAGE) {
      let query = supabase.from(name).select("*");
      for (const column of order) query = query.order(column as never);
      const { data: page, error } = await query.range(from, from + PAGE - 1);
      if (error) return new Response("Não foi possível ler os dados. Tente de novo.", { status: 500 });
      rows.push(...(page as Row[]));
      if (page.length < PAGE) break;
    }
    data[name] = rows;
  }

  const now = new Date();
  const zip = await buildBackupZip(data, now);
  return new Response(zip as BodyInit, {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="${backupFileName(now)}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
