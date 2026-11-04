import { describe, expect, it } from "vitest";
import { EMPTY_FORM, formToSheet, sheetToForm } from "@/lib/calculator-form";
import type { ContextSpool } from "@/lib/cost-sheet";

const spools: ContextSpool[] = [
  {
    id: "11111111-1111-4111-8111-111111111111",
    material: "PLA",
    color_name: "Preto",
    color_hex: "#111111",
    cost_per_gram: 0.1,
    remaining_g: 900,
    status: "in_use",
    brand: null,
  },
];

describe("formToSheet", () => {
  it("converte texto pt-BR e junta horas + minutos", () => {
    const { sheet, errors } = formToSheet(
      {
        ...EMPTY_FORM,
        printHours: "1",
        printMins: "25",
        prepMinutes: "10",
        postMinutes: "2,5",
        purgeG: "3,2",
        packagingCost: "1,50",
        quantity: "4",
        piecesPerPlate: "4",
        filaments: [
          { source: `spool:${spools[0].id}`, grams: "34,3" },
          { source: "material:PETG", grams: "7,88" },
        ],
        extras: [{ supplyId: "", name: "Argola", quantity: "", unitCost: "0,15" }],
      },
      spools,
    );
    expect(errors).toEqual([]);
    expect(sheet).toMatchObject({
      printMinutes: 85,
      prepMinutes: 10,
      postMinutes: 3, // minutos inteiros
      purgeG: 3.2,
      packagingCost: 1.5,
      quantity: 4,
      piecesPerPlate: 4,
      filaments: [
        { filamentId: spools[0].id, material: "PLA", colorHex: "#111111", grams: 34.3 },
        { filamentId: null, material: "PETG", colorHex: null, grams: 7.88 },
      ],
      extras: [{ supplyId: null, name: "Argola", quantity: 1, unitCost: 0.15 }],
    });
  });

  it("campos vazios: zero, e quantidade/peças por mesa = 1", () => {
    const { sheet, errors } = formToSheet(EMPTY_FORM, spools);
    expect(errors).toEqual([]);
    expect(sheet.quantity).toBe(1);
    expect(sheet.piecesPerPlate).toBe(1);
    expect(sheet.printMinutes).toBe(0);
    expect(sheet.kitSizes).toEqual([1]);
    expect(sheet.packMinutes).toBe(0);
  });

  it("\"Quero produzir\" vazio = uma mesa; preenchido = o lote", () => {
    expect(formToSheet({ ...EMPTY_FORM, piecesPerPlate: "5" }, spools).sheet.quantity).toBe(5);
    expect(formToSheet({ ...EMPTY_FORM, piecesPerPlate: "5", quantity: "12" }, spools).sheet.quantity).toBe(12);
  });

  it("kits sem repetição e em ordem; insumos por pedido marcados", () => {
    const { sheet, errors } = formToSheet(
      {
        ...EMPTY_FORM,
        packMinutes: "4",
        kits: [{ size: "5" }, { size: "1" }, { size: "3" }, { size: "5" }, { size: "" }],
        extras: [{ supplyId: "", name: "Ímã", quantity: "2", unitCost: "0,10" }],
        orderExtras: [{ supplyId: "", name: "Etiqueta", quantity: "1", unitCost: "0,30" }],
      },
      spools,
    );
    expect(errors).toEqual([]);
    expect(sheet.kitSizes).toEqual([1, 3, 5]);
    expect(sheet.packMinutes).toBe(4);
    expect(sheet.extras).toEqual([
      { supplyId: null, name: "Ímã", quantity: 2, unitCost: 0.1, perOrder: false },
      { supplyId: null, name: "Etiqueta", quantity: 1, unitCost: 0.3, perOrder: true },
    ]);
    expect(formToSheet({ ...EMPTY_FORM, kits: [{ size: "2,5" }] }, spools).errors).toHaveLength(1);
  });

  it("ida e volta: lote de uma mesa reabre vazio; insumos voltam ao bloco certo", () => {
    const { sheet } = formToSheet(
      {
        ...EMPTY_FORM,
        piecesPerPlate: "5",
        kits: [{ size: "1" }, { size: "3" }],
        orderExtras: [{ supplyId: "", name: "Etiqueta", quantity: "1", unitCost: "0,30" }],
      },
      spools,
    );
    const back = sheetToForm({ ...sheet, id: "x", name: "Tubarão", notes: null, sourceFilePath: null });
    expect(back.quantity).toBe("");
    expect(back.kits).toEqual([{ size: "1" }, { size: "3" }]);
    expect(back.extras).toEqual([]);
    expect(back.orderExtras).toEqual([{ supplyId: "", name: "Etiqueta", quantity: "1", unitCost: "0,3" }]);
  });

  it("aponta texto inválido e carretel inexistente", () => {
    const { errors } = formToSheet(
      { ...EMPTY_FORM, purgeG: "abc", filaments: [{ source: "spool:sumiu", grams: "10" }] },
      spools,
    );
    expect(errors).toEqual(expect.arrayContaining(["Purga: número inválido.", "Filamento 1: carretel não encontrado."]));
    expect(errors).toHaveLength(2);
  });
});

describe("sheetToForm", () => {
  it("ida e volta preserva a ficha", () => {
    const { sheet } = formToSheet(
      {
        ...EMPTY_FORM,
        printHours: "2",
        printMins: "5",
        packagingCost: "1,5",
        filaments: [{ source: "material:PLA", grams: "50" }],
      },
      spools,
    );
    const form = sheetToForm({ ...sheet, id: "x", name: "Chaveiro", notes: null, sourceFilePath: null });
    expect(form.printHours).toBe("2");
    expect(form.printMins).toBe("5");
    expect(form.packagingCost).toBe("1,5");
    expect(formToSheet(form, spools).sheet).toEqual(sheet);
  });
});
