import { describe, expect, it } from "vitest";
import { pdfText } from "@/lib/pdf-text";

describe("pdfText", () => {
  it("mantém acentos, cedilha, til e símbolos do WinAnsi", () => {
    const text = "Impressão, Condições, ç, ã, õ, é, ê, à · R$ 1.234,56 × 2 – “ok” 50%";
    expect(pdfText(text)).toBe(text);
  });

  it("troca símbolos fora da Helvetica", () => {
    expect(pdfText("−R$ 5,00")).toBe("-R$ 5,00");
    expect(pdfText("Pix → sinal… pronto")).toBe("Pix -> sinal... pronto");
  });

  it("remove emoji sem deixar espaço duplo", () => {
    expect(pdfText("Suporte 🎮 Xbox 🔥")).toBe("Suporte Xbox ");
  });

  it("acento decomposto (NFD) vira o caractere composto", () => {
    expect(pdfText("Impressão")).toBe("Impressão");
  });
});
