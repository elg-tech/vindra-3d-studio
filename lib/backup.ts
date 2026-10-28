import JSZip from "jszip";

/**
 * Tabelas do backup, na ordem em que uma restauração precisa inserir (pais antes dos filhos).
 * `order` é a chave estável usada para paginar a leitura.
 */
export const BACKUP_TABLES = [
  { name: "settings", order: ["id"] },
  { name: "printers", order: ["id"] },
  { name: "sales_channels", order: ["id"] },
  { name: "filament_brands", order: ["id"] },
  { name: "filaments", order: ["id"] },
  { name: "supplies", order: ["id"] },
  { name: "cost_sheets", order: ["id"] },
  { name: "cost_sheet_filaments", order: ["id"] },
  { name: "cost_sheet_supplies", order: ["id"] },
  { name: "products", order: ["id"] },
  { name: "product_variants", order: ["id"] },
  { name: "variant_channel_prices", order: ["id"] },
  { name: "customers", order: ["id"] },
  { name: "document_counters", order: ["kind", "year"] },
  { name: "quotes", order: ["id"] },
  { name: "quote_items", order: ["id"] },
  { name: "orders", order: ["id"] },
  { name: "order_items", order: ["id"] },
  { name: "order_payments", order: ["id"] },
  { name: "print_failures", order: ["id"] },
  { name: "filament_movements", order: ["id"] },
  { name: "transactions", order: ["id"] },
] as const;

export type BackupTable = (typeof BACKUP_TABLES)[number]["name"];
export type Row = Record<string, unknown>;
export type BackupData = Record<BackupTable, Row[]>;

export const BACKUP_FORMAT = "vindra-3d-studio/backup";
export const BACKUP_VERSION = 1;

/** Colunas calculadas pelo banco: saem no backup, mas não entram no insert da restauração. */
const GENERATED_COLUMNS: Partial<Record<BackupTable, string[]>> = { filaments: ["cost_per_gram"] };

function csvValue(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "number") return String(value).replace(".", ",");
  if (typeof value === "boolean") return value ? "sim" : "não";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

function csvCell(value: string): string {
  return /[;"\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

/**
 * CSV para o Excel: BOM, ";" e vírgula decimal (mesmo formato do CSV do financeiro).
 * Colunas na ordem em que aparecem nas linhas; tabela vazia sai só com o BOM.
 */
export function tableCsv(rows: Row[]): string {
  const columns: string[] = [];
  for (const row of rows) for (const key of Object.keys(row)) if (!columns.includes(key)) columns.push(key);
  const lines = [columns, ...rows.map((row) => columns.map((c) => csvValue(row[c])))];
  return `﻿${rows.length ? `${lines.map((l) => l.map(csvCell).join(";")).join("\r\n")}\r\n` : ""}`;
}

/** JSON completo: os valores como vieram do banco (é ele que serve para restaurar). */
export function backupJson(data: BackupData, exportedAt: Date): string {
  return JSON.stringify(
    {
      format: BACKUP_FORMAT,
      version: BACKUP_VERSION,
      exported_at: exportedAt.toISOString(),
      tables: Object.fromEntries(BACKUP_TABLES.map(({ name }) => [name, data[name]])),
    },
    null,
    2,
  );
}

/** Nome do arquivo no fuso de São Paulo: vindra-backup-2026-10-28.zip */
export function backupFileName(exportedAt: Date): string {
  const day = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(exportedAt);
  return `vindra-backup-${day}.zip`;
}

function sqlValue(value: unknown): string {
  if (value === null || value === undefined) return "null";
  if (typeof value === "number") return String(value);
  if (typeof value === "boolean") return value ? "true" : "false";
  const text = typeof value === "object" ? JSON.stringify(value) : String(value);
  return `'${text.replace(/'/g, "''")}'`;
}

/**
 * SQL de restauração a partir do backup.json, para colar no SQL Editor do Supabase.
 * Só acrescenta: linha que já existe (mesmo id) fica como está (`on conflict do nothing`).
 * Triggers e chaves estrangeiras ficam desligados durante a carga (o backup já vem na ordem certa e com os números
 * de orçamento e pedido preenchidos). `owner` troca o dono de todas as linhas (restaurar em outro projeto/usuário).
 */
export function restoreSql(backupText: string, owner?: string): string {
  const backup = JSON.parse(backupText) as { format?: string; version?: number; tables?: Record<string, Row[]> };
  if (backup.format !== BACKUP_FORMAT || !backup.tables) throw new Error("Este arquivo não é um backup do Vindra 3D Studio.");
  if (backup.version !== BACKUP_VERSION) throw new Error(`Versão de backup não suportada: ${backup.version}.`);
  if (owner !== undefined && !/^[0-9a-f-]{36}$/i.test(owner)) throw new Error("O dono precisa ser um id de usuário (uuid).");

  const lines = ["begin;", "set local session_replication_role = replica;"];
  for (const { name } of BACKUP_TABLES) {
    const rows = backup.tables[name] ?? [];
    if (rows.length) lines.push("", `-- ${name} (${rows.length})`);
    for (const row of rows) {
      const columns = Object.keys(row).filter((c) => !GENERATED_COLUMNS[name]?.includes(c));
      const values = columns.map((c) => sqlValue(c === "owner_id" && owner ? owner : row[c]));
      lines.push(`insert into public.${name} (${columns.join(", ")}) values (${values.join(", ")}) on conflict do nothing;`);
    }
  }
  lines.push("", "commit;");
  return `${lines.join("\n")}\n`;
}

export async function buildBackupZip(data: BackupData, exportedAt: Date): Promise<Uint8Array> {
  const zip = new JSZip();
  zip.file("backup.json", backupJson(data, exportedAt));
  for (const { name } of BACKUP_TABLES) zip.file(`csv/${name}.csv`, tableCsv(data[name]));
  zip.file(
    "LEIA-ME.txt",
    [
      "Backup do Vindra 3D Studio",
      `Exportado em ${exportedAt.toISOString()}`,
      "",
      "backup.json: todos os dados, como estão no banco. É o arquivo usado para restaurar.",
      "csv/: uma planilha por tabela, para abrir no Excel (separador ';' e vírgula decimal).",
      "As fotos dos produtos ficam no Storage do Supabase e não vão neste arquivo.",
      "Como restaurar: veja a seção Backup do README do projeto.",
    ].join("\r\n"),
  );
  return zip.generateAsync({ type: "uint8array", compression: "DEFLATE" });
}
