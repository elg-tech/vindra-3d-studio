import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { parseBambu3mf } from "@/lib/bambu3mf";
import { EMPTY_FORM, formToSheet } from "@/lib/calculator-form";
import { type ContextSpool, type PricingContext, evaluateSheet } from "@/lib/cost-sheet";
import { costInputOf, storedItemCost } from "@/lib/item-cost";
import { expectedConsumption } from "@/lib/orders";
import {
  colorName,
  combinePlates,
  filamentKey,
  importRows,
  materialMismatch,
  toStoredPlates,
} from "@/lib/plate-import";

// tests/fixtures/tres-mesas.gcode.3mf (gerado por tests/fixtures/tres-mesas/gerar.mjs):
// Mesa 1 "Base"      1h30 · slot 1 PLA laranja 40 g · slot 2 PLA branco 10 g
// Mesa 2 "Tampa"     45min · slot 1 PLA laranja 20 g · slot 3 PETG preto 15 g
// Mesa 3 "Detalhes"  30min · slot 2 PLA branco 5 g   · slot 4 PLA vermelho 8 g
// Mesa 4 "Rascunho"  não fatiada
const fixture = readFileSync(fileURLToPath(new URL("./fixtures/tres-mesas.gcode.3mf", import.meta.url)));

async function plates() {
  const r = await parseBambu3mf(fixture);
  if (!r.ok) throw new Error(r.error);
  return toStoredPlates(r.plates);
}

const LARANJA = "11111111-1111-4111-8111-111111111111";
const BRANCO = "22222222-2222-4222-8222-222222222222";
const VERMELHO = "33333333-3333-4333-8333-333333333333";

const spool = (over: Partial<ContextSpool>): ContextSpool => ({
  id: LARANJA,
  material: "PLA",
  color_name: "Laranja",
  color_hex: "#ff7000",
  cost_per_gram: 0.1,
  remaining_g: 800,
  status: "in_use",
  brand: null,
  ...over,
});

const spools = [
  spool({}),
  spool({ id: BRANCO, color_name: "Branco", color_hex: "#ffffff", cost_per_gram: 0.12 }),
  // vermelho bem mais caro, para a troca de cor mudar o custo
  spool({ id: VERMELHO, color_name: "Vermelho", color_hex: "#d01010", cost_per_gram: 0.3 }),
];

const ctx: PricingContext = {
  settings: {
    energy_rate_kwh: null,
    labor_hour_rate: null,
    failure_margin_pct: 0,
    default_margin_pct: 30,
    min_margin_pct: 15,
    tax_pct: 0,
    rounding_rule: "none",
  },
  printers: [],
  channels: [],
  spools,
  materialAverages: { PLA: 0.11, PETG: 0.15 },
  lastMaterialCosts: {},
};

const grams = (c: ReturnType<typeof combinePlates>) => Object.fromEntries(c.filaments.map((f) => [f.key, f.grams]));
const K = {
  laranja: filamentKey({ slot: 1, material: "PLA", color: "#ff6600" }),
  branco: filamentKey({ slot: 2, material: "PLA", color: "#ffffff" }),
  petg: filamentKey({ slot: 3, material: "PETG", color: "#000000" }),
  vermelho: filamentKey({ slot: 4, material: "PLA", color: "#ff0000" }),
};

describe("fixture de 3 mesas (formato do Bambu Studio)", () => {
  it("lê as 4 mesas do projeto, com nome; a não fatiada vem desabilitada", async () => {
    const p = await plates();
    expect(p.map((x) => [x.index, x.name, x.sliced])).toEqual([
      [1, "Base", true],
      [2, "Tampa", true],
      [3, "Detalhes", true],
      [4, "Rascunho", false],
    ]);
    expect(p[3]).toMatchObject({ printSeconds: 0, filaments: [] });
  });
});

describe("combinePlates", () => {
  it("soma de 3 mesas: tempo somado; mesma posição do AMS com a mesma cor soma junto", async () => {
    const c = combinePlates(await plates(), [1, 2, 3]);
    expect(c.plates).toHaveLength(3);
    expect(c.printSeconds).toBe(5400 + 2700 + 1800);
    expect(grams(c)).toEqual({ [K.laranja]: 60, [K.branco]: 15, [K.petg]: 15, [K.vermelho]: 8 });
    expect(c.grams).toBe(98);
    // em ordem de posição do AMS
    expect(c.filaments.map((f) => f.slot)).toEqual([1, 2, 3, 4]);
  });

  it("seleção parcial: 2 de 3", async () => {
    const c = combinePlates(await plates(), [1, 3]);
    expect(c.printSeconds).toBe(5400 + 1800);
    expect(grams(c)).toEqual({ [K.laranja]: 40, [K.branco]: 15, [K.vermelho]: 8 });
  });

  it("seleção parcial: 1 de 3", async () => {
    const c = combinePlates(await plates(), [2]);
    expect(c.printSeconds).toBe(2700);
    expect(grams(c)).toEqual({ [K.laranja]: 20, [K.petg]: 15 });
  });

  it("mesa não fatiada nunca entra, mesmo marcada", async () => {
    const p = await plates();
    expect(combinePlates(p, [4])).toMatchObject({ plates: [], printSeconds: 0, filaments: [], grams: 0 });
    expect(combinePlates(p, [2, 4]).printSeconds).toBe(2700);
  });

  it("nenhuma mesa marcada: vazio", async () => {
    expect(combinePlates(await plates(), []).filaments).toEqual([]);
  });
});

describe("troca de cores", () => {
  it("sugestão automática: cor mais próxima do mesmo material; sem carretel parecido, a média", async () => {
    const rows = importRows(combinePlates(await plates(), [1, 2, 3]).filaments, spools);
    expect(rows.map((r) => [r.fileKey, r.source])).toEqual([
      [K.laranja, `spool:${LARANJA}`],
      [K.branco, `spool:${BRANCO}`],
      [K.petg, "material:PETG"], // não há carretel de PETG
      [K.vermelho, `spool:${VERMELHO}`],
    ]);
    expect(rows[0]).toMatchObject({ fileColor: "#ff6600", fileMaterial: "PLA", fileType: "PLA", grams: "60" });
  });

  it("trocar de mesas mantém o carretel escolhido para o mesmo filamento do arquivo", async () => {
    const p = await plates();
    // o usuário trocou o laranja do arquivo pelo carretel vermelho
    const previous = importRows(combinePlates(p, [1, 2, 3]).filaments, spools).map((r) =>
      r.fileKey === K.laranja ? { ...r, source: `spool:${VERMELHO}` } : r,
    );
    const again = importRows(combinePlates(p, [1, 3]).filaments, spools, previous);
    expect(again.find((r) => r.fileKey === K.laranja)?.source).toBe(`spool:${VERMELHO}`);
    expect(again.find((r) => r.fileKey === K.laranja)?.grams).toBe("40");
  });

  it("custo e baixa usam o carretel escolhido, não a cor do arquivo", async () => {
    const rows = importRows(combinePlates(await plates(), [1]).filaments, spools);
    const before = formToSheet({ ...EMPTY_FORM, printHours: "1", filaments: rows }, spools);
    const swapped = formToSheet(
      { ...EMPTY_FORM, printHours: "1", filaments: rows.map((r) => (r.fileKey === K.laranja ? { ...r, source: `spool:${VERMELHO}` } : r)) },
      spools,
    );
    const cost = (s: typeof before.sheet) => {
      const ev = evaluateSheet(s, ctx);
      return ev.ok ? ev.result.unit.filament : null;
    };
    // laranja: 40 g × 0,10 + branco 10 g × 0,12 = 5,20 → com o vermelho: 40 × 0,30 + 1,20 = 13,20
    expect(cost(before.sheet)).toBeCloseTo(5.2, 6);
    expect(cost(swapped.sheet)).toBeCloseTo(13.2, 6);
    // a linha guarda a cor do arquivo só como referência
    expect(swapped.sheet.filaments[0]).toMatchObject({ filamentId: VERMELHO, colorHex: "#d01010", fileColorHex: "#ff6600" });
    expect(expectedConsumption([{ sheet: swapped.sheet, quantity: 1 }])).toContainEqual(
      expect.objectContaining({ filamentId: VERMELHO, grams: 40 }),
    );
  });

  it("duas cores do arquivo no mesmo carretel: as gramas somam na baixa", async () => {
    const rows = importRows(combinePlates(await plates(), [1, 3]).filaments, spools).map((r) =>
      r.fileKey === K.vermelho ? { ...r, source: `spool:${LARANJA}` } : r,
    );
    const { sheet, errors } = formToSheet({ ...EMPTY_FORM, printHours: "2", filaments: rows }, spools);
    expect(errors).toEqual([]);
    const lines = expectedConsumption([{ sheet, quantity: 1 }]);
    // laranja 40 g + vermelho do arquivo 8 g no mesmo carretel laranja
    expect(lines.find((l) => l.filamentId === LARANJA)?.grams).toBe(48);
    expect(lines.filter((l) => l.filamentId === LARANJA)).toHaveLength(1);
    expect(lines.find((l) => l.filamentId === BRANCO)?.grams).toBe(15);
  });

  it("material diferente do arquivo avisa", () => {
    expect(materialMismatch("PETG", "PLA")).toContain("O arquivo pede PETG e o carretel é PLA");
    expect(materialMismatch("PLA", "PLA")).toBeNull();
    expect(materialMismatch(undefined, "PLA")).toBeNull();
  });

  it("nome aproximado da cor do arquivo", () => {
    expect(colorName("#ff6600")).toBe("Laranja");
    expect(colorName("#ffffff")).toBe("Branco");
    expect(colorName("#000000")).toBe("Preto");
    expect(colorName("#e02020")).toBe("Vermelho");
    expect(colorName("xyz")).toBe("Cor");
  });
});

describe("custo do item avulso guarda as mesas", () => {
  it("cost_input com as mesas marcadas volta igual, para reabrir e trocar as mesas", async () => {
    const p = await plates();
    const rows = importRows(combinePlates(p, [1, 3]).filaments, spools);
    const { sheet } = formToSheet({ ...EMPTY_FORM, printHours: "2", filaments: rows }, spools);
    const cost = { source: "calc" as const, sheet, plateImport: { fileName: "tres-mesas.gcode.3mf", plates: p, selected: [1, 3] } };
    const back = storedItemCost("calc", costInputOf(cost as never));
    expect(back?.source === "calc" && back.plateImport?.selected).toEqual([1, 3]);
    expect(back?.source === "calc" && back.plateImport?.plates).toHaveLength(4);
    expect(back?.source === "calc" && back.sheet.filaments[0].fileKey).toBe(K.laranja);
  });

  it("custo antigo, sem mesas nem cor do arquivo, continua abrindo", () => {
    const old = {
      sheet: {
        printerId: null,
        printMinutes: 60,
        prepMinutes: 0,
        postMinutes: 0,
        purgeG: 0,
        packagingCost: 0,
        quantity: 1,
        piecesPerPlate: 1,
        filaments: [{ filamentId: null, material: "PLA", colorHex: null, grams: 20 }],
        extras: [],
      },
    };
    const back = storedItemCost("calc", old);
    expect(back?.source).toBe("calc");
    expect(back?.source === "calc" && back.plateImport).toBeUndefined();
  });
});
