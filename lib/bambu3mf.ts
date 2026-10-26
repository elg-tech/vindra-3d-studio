import JSZip from "jszip";
import type { Material } from "@/lib/filaments";

/**
 * Leitura de arquivos .3mf fatiados pelo Bambu Studio (.gcode.3mf ou projeto salvo após fatiar).
 *
 * Fonte principal: Metadata/slice_info.config — por mesa: tempo previsto (s), peso e
 * cada filamento com tipo, cor e gramas usados.
 * Fallback: cabeçalho do Metadata/plate_N.gcode.
 *
 * Observação: os gramas por filamento do Bambu Studio já incluem a purga (flush) e a
 * torre de limpeza; por isso a importação deixa o campo "purga" em 0.
 */

export type BambuFilament = {
  /** Posição do filamento no projeto (1, 2, 3…). */
  slot: number;
  /** Tipo como o fatiador escreve (ex.: "PLA", "PETG"). */
  type: string;
  material: Material;
  /** #rrggbb */
  color: string;
  grams: number;
};

export type BambuPlate = {
  index: number;
  printSeconds: number;
  /** Peso total informado pelo fatiador (g), quando presente. */
  weightG: number | null;
  filaments: BambuFilament[];
  objects: string[];
};

export type Bambu3mfResult =
  | { ok: true; plates: BambuPlate[]; source: "slice_info" | "gcode" }
  | { ok: false; code: "invalid_file" | "not_bambu" | "not_sliced"; error: string };

const ERRORS = {
  invalid_file: "Não foi possível abrir o arquivo. Envie um .3mf exportado pelo Bambu Studio.",
  not_bambu: "Este .3mf não tem os dados do Bambu Studio. Exporte pelo Bambu Studio.",
  not_sliced:
    "O arquivo não foi fatiado. No Bambu Studio, fatie a mesa e use Arquivo → Exportar → “Exportar arquivo de mesa fatiada” (.gcode.3mf).",
} as const;

// ---------------------------------------------------------------
// Utilitários de texto (sem DOMParser, para rodar no navegador e no Node)
// ---------------------------------------------------------------

function decodeXml(s: string): string {
  return s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
}

/** Atributos de uma tag: `<x a="1" b='2'/>` → { a: "1", b: "2" }. */
function attributes(tag: string): Record<string, string> {
  const attrs: Record<string, string> = {};
  for (const m of tag.matchAll(/([\w:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g)) {
    attrs[m[1]] = decodeXml(m[2] ?? m[3] ?? "");
  }
  return attrs;
}

function toNumber(value: string | undefined): number | null {
  if (value === undefined || value.trim() === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

/** "#FFFFFF", "#ffffffff", "FFFFFF" → "#ffffff". Inválido → cinza. */
export function normalizeColor(value: string | undefined): string {
  const hex = (value ?? "").trim().replace(/^#/, "");
  return /^[0-9a-f]{6}([0-9a-f]{2})?$/i.test(hex) ? `#${hex.slice(0, 6).toLowerCase()}` : "#888888";
}

/** Tipo do fatiador → material do cadastro. */
export function toMaterial(type: string): Material {
  const t = type.toUpperCase();
  if (t.includes("SILK")) return "PLA Silk";
  if (t.includes("MATTE")) return "PLA Matte";
  if (t.startsWith("PLA")) return "PLA";
  if (t.startsWith("PETG")) return "PETG";
  if (t.startsWith("TPU")) return "TPU";
  if (t.startsWith("ABS")) return "ABS";
  if (t.startsWith("ASA")) return "ASA";
  return "Outro";
}

/** "1d 2h 3m 4s", "1h 22m 20s", "45m 10s" → segundos. */
export function parseDuration(text: string): number | null {
  const units: Record<string, number> = { d: 86400, h: 3600, m: 60, s: 1 };
  let total = 0;
  let found = false;
  for (const m of text.matchAll(/(\d+(?:\.\d+)?)\s*([dhms])\b/gi)) {
    total += Number(m[1]) * units[m[2].toLowerCase()];
    found = true;
  }
  return found ? Math.round(total) : null;
}

// ---------------------------------------------------------------
// slice_info.config
// ---------------------------------------------------------------

export function parseSliceInfo(xml: string): BambuPlate[] {
  const plates: BambuPlate[] = [];

  for (const block of xml.matchAll(/<plate\b[^>]*>([\s\S]*?)<\/plate>/g)) {
    const body = block[1];
    const meta: Record<string, string> = {};
    for (const tag of body.matchAll(/<metadata\b[^>]*\/?>/g)) {
      const a = attributes(tag[0]);
      if (a.key) meta[a.key] = a.value ?? "";
    }

    const filaments: BambuFilament[] = [];
    for (const tag of body.matchAll(/<filament\b[^>]*\/?>/g)) {
      const a = attributes(tag[0]);
      const grams = toNumber(a.used_g) ?? 0;
      if (grams <= 0) continue;
      const type = a.type ?? "";
      filaments.push({
        slot: toNumber(a.id) ?? filaments.length + 1,
        type,
        material: toMaterial(type),
        color: normalizeColor(a.color),
        grams,
      });
    }

    const objects = [...body.matchAll(/<object\b[^>]*\/?>/g)]
      .map((tag) => attributes(tag[0]))
      .filter((a) => a.skipped !== "true" && a.name)
      .map((a) => a.name);

    plates.push({
      index: toNumber(meta.index) ?? plates.length + 1,
      printSeconds: Math.round(toNumber(meta.prediction) ?? 0),
      weightG: toNumber(meta.weight),
      filaments,
      objects,
    });
  }

  return plates;
}

// ---------------------------------------------------------------
// Cabeçalho do G-code (fallback)
// ---------------------------------------------------------------

export function parseGcodeHeader(text: string, index = 1): BambuPlate | null {
  const line = (pattern: RegExp) => text.match(pattern)?.[1]?.trim();

  const total = line(/total estimated time:\s*([^;\n]+)/i) ?? line(/estimated printing time[^=:]*[=:]\s*([^;\n]+)/i);
  const seconds = total ? parseDuration(total) : null;

  const weights = (line(/total filament weight \[g\]\s*:\s*([^\n]+)/i) ?? line(/filament used \[g\]\s*=\s*([^\n]+)/i) ?? "")
    .split(/[,;]/)
    .map((v) => toNumber(v.trim()))
    .filter((v): v is number => v !== null);

  if (!seconds || weights.length === 0) return null;

  const types = (line(/;\s*filament_type\s*=\s*([^\n]+)/i) ?? "").split(";").map((s) => s.trim());
  const colors = (line(/;\s*filament_colou?r\s*=\s*([^\n]+)/i) ?? "").split(";").map((s) => s.trim());

  const filaments = weights
    .map((grams, i) => ({
      slot: i + 1,
      type: types[i] || "PLA",
      material: toMaterial(types[i] || "PLA"),
      color: normalizeColor(colors[i]),
      grams,
    }))
    .filter((f) => f.grams > 0);

  return { index, printSeconds: seconds, weightG: weights.reduce((s, g) => s + g, 0), filaments, objects: [] };
}

// ---------------------------------------------------------------
// Arquivo
// ---------------------------------------------------------------

/** Lê só o começo do G-code: o cabeçalho fica nas primeiras linhas. */
async function readGcodeHead(file: JSZip.JSZipObject): Promise<string> {
  const bytes = await file.async("uint8array");
  return new TextDecoder().decode(bytes.subarray(0, 256 * 1024));
}

export async function parseBambu3mf(data: ArrayBuffer | Uint8Array | Blob): Promise<Bambu3mfResult> {
  let zip: JSZip;
  try {
    zip = await JSZip.loadAsync(data);
  } catch {
    return { ok: false, code: "invalid_file", error: ERRORS.invalid_file };
  }

  const sliceInfo = zip.file(/^Metadata\/slice_info\.config$/i)[0];
  const gcodes = zip.file(/^Metadata\/plate_\d+\.gcode$/i);
  if (!sliceInfo && gcodes.length === 0) {
    const hasMetadata = zip.file(/^Metadata\//i).length > 0;
    return hasMetadata
      ? { ok: false, code: "not_sliced", error: ERRORS.not_sliced }
      : { ok: false, code: "not_bambu", error: ERRORS.not_bambu };
  }

  if (sliceInfo) {
    const plates = parseSliceInfo(await sliceInfo.async("string")).filter(
      (p) => p.printSeconds > 0 && p.filaments.length > 0,
    );
    if (plates.length > 0) return { ok: true, plates, source: "slice_info" };
  }

  const fromGcode: BambuPlate[] = [];
  for (const file of gcodes) {
    const index = Number(file.name.match(/plate_(\d+)\.gcode$/i)?.[1] ?? fromGcode.length + 1);
    const plate = parseGcodeHeader(await readGcodeHead(file), index);
    if (plate) fromGcode.push(plate);
  }
  if (fromGcode.length > 0) {
    return { ok: true, plates: fromGcode.sort((a, b) => a.index - b.index), source: "gcode" };
  }

  return { ok: false, code: "not_sliced", error: ERRORS.not_sliced };
}
