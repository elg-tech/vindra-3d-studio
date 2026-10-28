import JSZip from "jszip";
import { describe, expect, it } from "vitest";
import {
  BACKUP_TABLES,
  type BackupData,
  backupFileName,
  backupJson,
  buildBackupZip,
  restoreSql,
  tableCsv,
} from "@/lib/backup";

const BOM = "﻿";
const empty = () => Object.fromEntries(BACKUP_TABLES.map(({ name }) => [name, []])) as unknown as BackupData;
const at = new Date("2026-10-29T01:30:00Z"); // 28/10 22:30 em São Paulo

describe("tableCsv", () => {
  it("usa ';', vírgula decimal, sim/não e aspas quando precisa", () => {
    const csv = tableCsv([
      { id: "a", name: 'PLA "Seda"; azul', price: 89.9, active: true, notes: null },
      { id: "b", name: "PETG", price: 120, active: false, extra: { x: 1 } },
    ]);
    expect(csv).toBe(
      `${BOM}id;name;price;active;notes;extra\r\n` +
        `a;"PLA ""Seda""; azul";89,9;sim;;\r\n` +
        `b;PETG;120;não;;"{""x"":1}"\r\n`,
    );
  });

  it("tabela vazia sai só com o BOM", () => {
    expect(tableCsv([])).toBe(BOM);
  });
});

describe("backupJson", () => {
  it("guarda formato, versão, data e as tabelas na ordem de restauração", () => {
    const data = empty();
    data.customers = [{ id: "c1", name: "Ana" }];
    const parsed = JSON.parse(backupJson(data, at));
    expect(parsed.format).toBe("vindra-3d-studio/backup");
    expect(parsed.version).toBe(1);
    expect(parsed.exported_at).toBe("2026-10-29T01:30:00.000Z");
    expect(Object.keys(parsed.tables)).toEqual(BACKUP_TABLES.map((t) => t.name));
    expect(parsed.tables.customers).toEqual([{ id: "c1", name: "Ana" }]);
  });
});

describe("backupFileName", () => {
  it("usa o dia de São Paulo", () => {
    expect(backupFileName(at)).toBe("vindra-backup-2026-10-28.zip");
  });
});

describe("buildBackupZip", () => {
  it("tem o JSON, um CSV por tabela e o LEIA-ME", async () => {
    const data = empty();
    data.filaments = [{ id: "f1", price_paid: 99.5 }];
    const zip = await JSZip.loadAsync(await buildBackupZip(data, at));
    const names = Object.keys(zip.files);
    expect(names).toContain("backup.json");
    expect(names).toContain("LEIA-ME.txt");
    for (const { name } of BACKUP_TABLES) expect(names).toContain(`csv/${name}.csv`);
    expect(await zip.file("csv/filaments.csv")!.async("string")).toBe(`${BOM}id;price_paid\r\n` + "f1;99,5\r\n");
  });
});

describe("restoreSql", () => {
  const backup = (tables: Partial<BackupData>) => backupJson({ ...empty(), ...tables }, at);

  it("insere na ordem das tabelas, sem a coluna gerada, sem sobrescrever", () => {
    const sql = restoreSql(
      backup({
        quotes: [{ id: "q1", owner_id: "u1", number: "VND-2026-0001", notes: "d'água" }],
        filaments: [{ id: "f1", owner_id: "u1", price_paid: 90, cost_per_gram: 0.09, active: true, meta: null }],
      }),
    );
    expect(sql.startsWith("begin;\nset local session_replication_role = replica;\n")).toBe(true);
    expect(sql.trimEnd().endsWith("commit;")).toBe(true);
    expect(sql.indexOf("public.filaments")).toBeLessThan(sql.indexOf("public.quotes"));
    expect(sql).toContain(
      "insert into public.filaments (id, owner_id, price_paid, active, meta) values ('f1', 'u1', 90, true, null) on conflict do nothing;",
    );
    expect(sql).toContain("'d''água'");
    expect(sql).not.toContain("cost_per_gram");
  });

  it("troca o dono quando pedido", () => {
    const owner = "11111111-2222-3333-4444-555555555555";
    const sql = restoreSql(backup({ customers: [{ id: "c1", owner_id: "u1", name: "Ana" }] }), owner);
    expect(sql).toContain(`values ('c1', '${owner}', 'Ana')`);
  });

  it("recusa arquivo que não é backup, versão desconhecida e dono inválido", () => {
    expect(() => restoreSql("{}")).toThrow("não é um backup");
    expect(() => restoreSql(JSON.stringify({ format: "vindra-3d-studio/backup", version: 9, tables: {} }))).toThrow("Versão");
    expect(() => restoreSql(backup({}), "x'; drop table")).toThrow("uuid");
  });
});
