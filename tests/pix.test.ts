import { describe, expect, it } from "vitest";
import { buildPixPayload, crc16, normalizePixKey, pixMerchantCity, pixMerchantName } from "@/lib/pix";

describe("crc16", () => {
  it("valor de referência do CRC-16/CCITT-FALSE", () => {
    expect(crc16("123456789")).toBe("29B1");
  });
});

describe("buildPixPayload", () => {
  it("reproduz o exemplo do Manual de Padrões para Iniciação do Pix (BCB)", () => {
    const payload = buildPixPayload({
      key: "123e4567-e12b-12d1-a456-426655440000",
      merchantName: "Fulano de Tal",
      merchantCity: "BRASILIA",
    });
    expect(payload).toBe(
      "00020126580014br.gov.bcb.pix0136123e4567-e12b-12d1-a456-4266554400005204000053039865802BR5913Fulano de Tal6008BRASILIA62070503***63041D3D",
    );
  });

  it("com valor: campo 54 com duas casas e CRC recalculado", () => {
    const payload = buildPixPayload({
      key: "123e4567-e12b-12d1-a456-426655440000",
      merchantName: "Fulano de Tal",
      merchantCity: "BRASILIA",
      amount: 39.9,
    });
    expect(payload).toContain("5303986540539.905802BR");
    // o CRC do final confere com o resto do código
    expect(payload.slice(-4)).toBe(crc16(payload.slice(0, -4)));
    expect(payload).not.toBe(
      "00020126580014br.gov.bcb.pix0136123e4567-e12b-12d1-a456-4266554400005204000053039865802BR5913Fulano de Tal6008BRASILIA62070503***63041D3D",
    );
  });

  it("valor zero ou negativo é erro", () => {
    expect(() => buildPixPayload({ key: "a@b.co", merchantName: "X", merchantCity: "Y", amount: 0 })).toThrow();
  });

  it("acentos saem do nome e da cidade (Matão/SP vira MATAO)", () => {
    const payload = buildPixPayload({ key: "+5516999999999", merchantName: "Impressão Ação 3D", merchantCity: "Matão/SP" });
    expect(payload).toContain("5917Impressao Acao 3D");
    expect(payload).toContain("6005MATAO");
    expect(payload).toContain("0114+5516999999999");
  });
});

describe("nome e cidade do recebedor", () => {
  it("nome até 25 caracteres", () => {
    expect(pixMerchantName("Vindra 3D Impressões e Presentes Personalizados")).toBe("Vindra 3D Impressoes e Pr");
  });
  it("cidade em maiúsculas, sem UF, até 15 caracteres", () => {
    expect(pixMerchantCity("São José do Rio Preto - SP")).toBe("SAO JOSE DO RIO");
    expect(pixMerchantCity(null)).toBe("BRASIL");
  });
});

describe("normalizePixKey", () => {
  it("CPF e CNPJ só com dígitos", () => {
    expect(normalizePixKey("123.456.789-09", "cpf")).toEqual({ ok: true, key: "12345678909" });
    expect(normalizePixKey("12.345.678/0001-95", "cnpj")).toEqual({ ok: true, key: "12345678000195" });
    expect(normalizePixKey("123", "cpf").ok).toBe(false);
  });

  it("celular vira +55 + DDD + número (11 dígitos não é CPF quando o tipo é celular)", () => {
    expect(normalizePixKey("(16) 99999-9999", "phone")).toEqual({ ok: true, key: "+5516999999999" });
    expect(normalizePixKey("+55 16 99999-9999", "phone")).toEqual({ ok: true, key: "+5516999999999" });
    expect(normalizePixKey("16999999999", "phone")).toEqual({ ok: true, key: "+5516999999999" });
    expect(normalizePixKey("99999-9999", "phone").ok).toBe(false);
  });

  it("e-mail e chave aleatória em minúsculas", () => {
    expect(normalizePixKey(" Loja@Vindra.com ", "email")).toEqual({ ok: true, key: "loja@vindra.com" });
    expect(normalizePixKey("123E4567-E12B-12D1-A456-426655440000", "random")).toEqual({
      ok: true,
      key: "123e4567-e12b-12d1-a456-426655440000",
    });
    expect(normalizePixKey("nao-e-email", "email").ok).toBe(false);
  });
});
