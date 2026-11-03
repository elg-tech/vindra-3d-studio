import type { BambuPlate } from "@/lib/bambu3mf";
import { type ContextSpool, matchSpool } from "@/lib/cost-sheet";
import type { Material } from "@/lib/filaments";

/**
 * Importação de várias mesas do .3mf como UMA peça/kit: soma o tempo e as gramas por filamento.
 * O mesmo filamento é a mesma posição do AMS com o mesmo material e cor (assim mesas diferentes somam juntas).
 * O que foi importado fica guardado (PlateImport) para reabrir e trocar as mesas sem enviar o arquivo de novo.
 */

export type StoredPlate = Pick<BambuPlate, "index" | "name" | "sliced" | "printSeconds" | "filaments">;

export type PlateImport = {
  fileName: string;
  plates: StoredPlate[];
  /** Mesas marcadas (índices). */
  selected: number[];
};

export type ImportedFilament = {
  /** slot|material|cor: identifica o filamento do arquivo entre as mesas. */
  key: string;
  slot: number;
  type: string;
  material: Material;
  /** Cor no arquivo, #rrggbb. */
  color: string;
  grams: number;
};

export type CombinedPlates = {
  plates: StoredPlate[];
  printSeconds: number;
  filaments: ImportedFilament[];
  grams: number;
};

export const filamentKey = (f: { slot: number; material: string; color: string }) => `${f.slot}|${f.material}|${f.color}`;

const round2 = (n: number) => Math.round(n * 100) / 100;

export function toStoredPlates(plates: BambuPlate[]): StoredPlate[] {
  return plates.map(({ index, name, sliced, printSeconds, filaments }) => ({ index, name, sliced, printSeconds, filaments }));
}

/** Soma as mesas marcadas (mesa não fatiada nunca entra). */
export function combinePlates(plates: StoredPlate[], selected: number[]): CombinedPlates {
  const chosen = plates.filter((p) => p.sliced && selected.includes(p.index));
  const byKey = new Map<string, ImportedFilament>();
  for (const plate of chosen) {
    for (const f of plate.filaments) {
      const key = filamentKey(f);
      const current = byKey.get(key);
      if (current) current.grams += f.grams;
      else byKey.set(key, { key, slot: f.slot, type: f.type, material: f.material, color: f.color, grams: f.grams });
    }
  }
  const filaments = [...byKey.values()]
    .map((f) => ({ ...f, grams: round2(f.grams) }))
    .sort((a, b) => a.slot - b.slot);
  return {
    plates: chosen,
    printSeconds: chosen.reduce((s, p) => s + p.printSeconds, 0),
    filaments,
    grams: round2(filaments.reduce((s, f) => s + f.grams, 0)),
  };
}

export const plateGrams = (p: StoredPlate) => round2(p.filaments.reduce((s, f) => s + f.grams, 0));
export const plateLabel = (p: Pick<StoredPlate, "index" | "name">) => (p.name ? `Mesa ${p.index} · ${p.name}` : `Mesa ${p.index}`);

/** Linha de filamento do formulário vinda do arquivo: a cor do arquivo + o carretel escolhido (source). */
export type ImportedRow = {
  source: string;
  grams: string;
  fileKey: string;
  fileColor: string;
  fileMaterial: Material;
  fileType: string;
};

/**
 * Linhas do formulário para o conjunto importado. Carretel: o já escolhido antes para o mesmo filamento do
 * arquivo (trocar de mesas não desfaz a troca de cor); senão a cor mais próxima do mesmo material; senão a média.
 */
export function importRows(
  filaments: ImportedFilament[],
  spools: ContextSpool[],
  previous: { fileKey?: string; source: string }[] = [],
  formatGrams: (g: number) => string = (g) => String(g).replace(".", ","),
): ImportedRow[] {
  const chosen = new Map(previous.flatMap((r) => (r.fileKey ? [[r.fileKey, r.source] as const] : [])));
  return filaments.map((f) => {
    const spool = matchSpool(f.material, f.color, spools);
    return {
      source: chosen.get(f.key) ?? (spool ? `spool:${spool.id}` : `material:${f.material}`),
      grams: formatGrams(f.grams),
      fileKey: f.key,
      fileColor: f.color,
      fileMaterial: f.material,
      fileType: f.type,
    };
  });
}

// ---------------------------------------------------------------
// Nome da cor (aproximado), para "Cor no arquivo: Laranja"
// ---------------------------------------------------------------
const COLOR_NAMES: [string, string][] = [
  ["Preto", "#000000"],
  ["Branco", "#ffffff"],
  ["Cinza", "#808080"],
  ["Cinza claro", "#c8c8c8"],
  ["Cinza escuro", "#404040"],
  ["Vermelho", "#e02020"],
  ["Vinho", "#7a1f2b"],
  ["Laranja", "#ff7a00"],
  ["Amarelo", "#f5d000"],
  ["Bege", "#e8d6b0"],
  ["Marrom", "#7b4a24"],
  ["Verde", "#00ae42"],
  ["Verde-escuro", "#1e5631"],
  ["Verde-claro", "#9be564"],
  ["Azul", "#1f5fd6"],
  ["Azul-claro", "#6ec6ff"],
  ["Azul-marinho", "#1b2a4a"],
  ["Ciano", "#00bcd4"],
  ["Roxo", "#7b3fb5"],
  ["Lilás", "#c3a6e0"],
  ["Rosa", "#ff7eb6"],
  ["Magenta", "#d6157a"],
  ["Dourado", "#c9a227"],
  ["Prata", "#a8a9ad"],
];

function rgb(hex: string): [number, number, number] {
  const h = hex.replace("#", "");
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16)) as [number, number, number];
}

export function colorName(hex: string): string {
  if (!/^#[0-9a-f]{6}$/i.test(hex)) return "Cor";
  const [r, g, b] = rgb(hex);
  let best = COLOR_NAMES[0];
  let bestD = Infinity;
  for (const entry of COLOR_NAMES) {
    const [r2, g2, b2] = rgb(entry[1]);
    // pesos aproximam a percepção (verde pesa mais)
    const d = 2 * (r - r2) ** 2 + 4 * (g - g2) ** 2 + 3 * (b - b2) ** 2;
    if (d < bestD) {
      bestD = d;
      best = entry;
    }
  }
  return best[0];
}

/** Aviso quando o carretel escolhido é de outro material que o do arquivo (ex.: arquivo PETG, carretel PLA). */
export function materialMismatch(fileMaterial: string | undefined, spoolMaterial: string | undefined): string | null {
  if (!fileMaterial || !spoolMaterial || fileMaterial === spoolMaterial) return null;
  return `O arquivo pede ${fileMaterial} e o carretel é ${spoolMaterial}: confira se a impressão e a temperatura servem.`;
}
