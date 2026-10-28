// Gera o SQL de restauração a partir do backup.json (de dentro do .zip de "Exportar meus dados").
// Não conecta no banco: só escreve o arquivo .sql, para colar no SQL Editor do Supabase.
// Uso: node scripts/restaurar-backup.ts caminho/backup.json [--dono=<uuid do usuário>] > restaurar.sql
import { readFileSync } from "node:fs";
import { restoreSql } from "../lib/backup.ts";

const [file, ...flags] = process.argv.slice(2);
if (!file) {
  console.error("Uso: node scripts/restaurar-backup.ts backup.json [--dono=<uuid>] > restaurar.sql");
  process.exit(1);
}
const owner = flags.find((f) => f.startsWith("--dono="))?.slice("--dono=".length);
process.stdout.write(restoreSql(readFileSync(file, "utf8"), owner));
