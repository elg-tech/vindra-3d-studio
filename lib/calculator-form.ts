import type { ContextSpool, SheetData } from "@/lib/cost-sheet";
import { MATERIALS, type Material } from "@/lib/filaments";
import { parseDecimal } from "@/lib/numbers";
import type { PlateImport } from "@/lib/plate-import";

/** Estado do formulário da calculadora: tudo texto, como digitado. */
export type CalcFormValues = {
  id?: string;
  name: string;
  printerId: string;
  printHours: string;
  printMins: string;
  piecesPerPlate: string;
  quantity: string;
  prepMinutes: string;
  postMinutes: string;
  purgeG: string;
  packagingCost: string;
  /**
   * source: "spool:<id>" ou "material:<Material>".
   * spoolRemoved: a ficha salva apontava para um carretel excluído (só para o aviso; trocar a fonte limpa).
   */
  filaments: {
    source: string;
    grams: string;
    spoolRemoved?: boolean;
    /** Filamento do .3mf (cor e material do arquivo): só referência para a troca de cor. */
    fileKey?: string;
    fileColor?: string;
    fileMaterial?: string;
    fileType?: string;
  }[];
  extras: { supplyId: string; name: string; quantity: string; unitCost: string }[];
  notes: string;
  sourceFilePath: string;
  /** Mesas do .3mf importadas (para trocar as mesas sem enviar o arquivo de novo). */
  plateImport?: PlateImport | null;
};

export const spoolSource = (id: string) => `spool:${id}`;
export const materialSource = (m: string) => `material:${m}`;

export const EMPTY_FORM: CalcFormValues = {
  name: "",
  printerId: "",
  printHours: "",
  printMins: "",
  piecesPerPlate: "1",
  quantity: "1",
  prepMinutes: "",
  postMinutes: "",
  purgeG: "",
  packagingCost: "",
  filaments: [{ source: materialSource("PLA"), grams: "" }],
  extras: [],
  notes: "",
  sourceFilePath: "",
  plateImport: null,
};

/**
 * Converte o formulário em ficha. Campos vazios valem 0 (quantidade e peças por
 * mesa valem 1); textos inválidos viram erro com o nome do campo.
 */
export function formToSheet(values: CalcFormValues, spools: ContextSpool[]): { sheet: SheetData; errors: string[] } {
  const errors: string[] = [];

  const num = (value: string, label: string, fallback = 0): number => {
    if (value.trim() === "") return fallback;
    const n = parseDecimal(value);
    if (n === null) {
      errors.push(`${label}: número inválido.`);
      return fallback;
    }
    return n;
  };

  const hours = num(values.printHours, "Horas de impressão");
  const mins = num(values.printMins, "Minutos de impressão");

  const filaments = values.filaments.map((row, i) => {
    const grams = num(row.grams, `Filamento ${i + 1} (g)`);
    // a cor do arquivo vai junto só como referência (custo e baixa usam o carretel/material escolhido)
    const file = row.fileKey ? { fileKey: row.fileKey, fileColorHex: row.fileColor, fileMaterial: row.fileMaterial } : {};
    if (row.source.startsWith("spool:")) {
      const spool = spools.find((s) => s.id === row.source.slice(6));
      if (spool) return { filamentId: spool.id, material: spool.material, colorHex: spool.color_hex, grams, ...file };
      errors.push(`Filamento ${i + 1}: carretel não encontrado.`);
    }
    const m = row.source.startsWith("material:") ? row.source.slice(9) : "PLA";
    const material: Material = (MATERIALS as readonly string[]).includes(m) ? (m as Material) : "Outro";
    return { filamentId: null, material, colorHex: null, grams, spoolRemoved: row.spoolRemoved ?? false, ...file };
  });

  const extras = values.extras.map((e, i) => ({
    supplyId: e.supplyId || null,
    name: e.name.trim() || `Insumo ${i + 1}`,
    quantity: num(e.quantity, `${e.name || `Insumo ${i + 1}`} (quantidade)`, 1),
    unitCost: num(e.unitCost, `${e.name || `Insumo ${i + 1}`} (custo)`),
  }));

  return {
    sheet: {
      printerId: values.printerId || null,
      printMinutes: Math.round(hours * 60 + mins),
      prepMinutes: Math.round(num(values.prepMinutes, "Preparação")),
      postMinutes: Math.round(num(values.postMinutes, "Pós-processamento")),
      purgeG: num(values.purgeG, "Purga"),
      packagingCost: num(values.packagingCost, "Embalagem"),
      quantity: num(values.quantity, "Quantidade", 1),
      piecesPerPlate: num(values.piecesPerPlate, "Peças por mesa", 1),
      filaments,
      extras,
    },
    errors,
  };
}

const field = (n: number) => (n === 0 ? "" : String(n).replace(".", ","));

/** Ficha salva → formulário. */
export function sheetToForm(
  sheet: SheetData & { id: string; name: string; notes: string | null; sourceFilePath: string | null },
): CalcFormValues {
  return {
    id: sheet.id,
    name: sheet.name,
    printerId: sheet.printerId ?? "",
    printHours: field(Math.floor(sheet.printMinutes / 60)),
    printMins: field(sheet.printMinutes % 60),
    piecesPerPlate: String(sheet.piecesPerPlate),
    quantity: String(sheet.quantity),
    prepMinutes: field(sheet.prepMinutes),
    postMinutes: field(sheet.postMinutes),
    purgeG: field(sheet.purgeG),
    packagingCost: field(sheet.packagingCost),
    filaments: sheet.filaments.map((f) => ({
      source: f.filamentId ? spoolSource(f.filamentId) : materialSource(f.material),
      grams: field(f.grams),
      ...(f.spoolRemoved ? { spoolRemoved: true } : {}),
      ...(f.fileKey ? { fileKey: f.fileKey, fileColor: f.fileColorHex, fileMaterial: f.fileMaterial } : {}),
    })),
    extras: sheet.extras.map((e) => ({
      supplyId: e.supplyId ?? "",
      name: e.name,
      quantity: field(e.quantity),
      unitCost: field(e.unitCost),
    })),
    notes: sheet.notes ?? "",
    sourceFilePath: sheet.sourceFilePath ?? "",
  };
}
