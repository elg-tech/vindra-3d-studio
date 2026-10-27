/**
 * Pix copia e cola estático (BR Code / EMV-MPM), conforme o Manual de Padrões para
 * Iniciação do Pix do Banco Central. Estático: sem txid próprio ("***"), pode ser pago
 * mais de uma vez; o valor vem preenchido e o app do banco mostra o nome do recebedor
 * pela chave.
 */

export const PIX_KEY_TYPES = ["cpf", "cnpj", "phone", "email", "random"] as const;
export type PixKeyType = (typeof PIX_KEY_TYPES)[number];

export const PIX_KEY_TYPE_LABEL: Record<PixKeyType, string> = {
  cpf: "CPF",
  cnpj: "CNPJ",
  phone: "Celular",
  email: "E-mail",
  random: "Chave aleatória",
};

export type PixKeyResult = { ok: true; key: string } | { ok: false; error: string };

/** Chave no formato do BR Code: CPF/CNPJ só dígitos, celular +55DDDNÚMERO, e-mail e aleatória em minúsculas. */
export function normalizePixKey(raw: string, type: PixKeyType): PixKeyResult {
  const value = raw.trim();
  const digits = value.replace(/\D/g, "");
  switch (type) {
    case "cpf":
      return digits.length === 11 ? { ok: true, key: digits } : { ok: false, error: "CPF precisa ter 11 dígitos." };
    case "cnpj":
      return digits.length === 14 ? { ok: true, key: digits } : { ok: false, error: "CNPJ precisa ter 14 dígitos." };
    case "phone": {
      // aceita "(16) 99999-9999", "16999999999", "+55 16 99999-9999"
      const local = digits.length >= 12 && digits.startsWith("55") ? digits.slice(2) : digits;
      return local.length === 10 || local.length === 11
        ? { ok: true, key: `+55${local}` }
        : { ok: false, error: "Celular precisa ter DDD + número." };
    }
    case "email":
      return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value) && value.length <= 77
        ? { ok: true, key: value.toLowerCase() }
        : { ok: false, error: "E-mail inválido." };
    case "random":
      return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)
        ? { ok: true, key: value.toLowerCase() }
        : { ok: false, error: "Chave aleatória inválida (formato 8-4-4-4-12)." };
  }
}

/** Sem acentos e só caracteres seguros para o BR Code. */
function asciiText(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^A-Za-z0-9 .,\-/&]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** Nome do recebedor: até 25 caracteres, sem acentos. */
export function pixMerchantName(name: string): string {
  return asciiText(name).slice(0, 25).trim() || "RECEBEDOR";
}

/** Cidade do recebedor: "Matão/SP" vira "MATAO" (até 15 caracteres, maiúsculas, sem UF). */
export function pixMerchantCity(city: string | null): string {
  const name = (city ?? "").split("/")[0].split(" - ")[0];
  return asciiText(name).toUpperCase().slice(0, 15).trim() || "BRASIL";
}

const field = (id: string, value: string) => {
  if (value.length > 99) throw new Error(`Campo ${id} do Pix passa de 99 caracteres.`);
  return `${id}${String(value.length).padStart(2, "0")}${value}`;
};

/** CRC16-CCITT-FALSE (polinômio 0x1021, início 0xFFFF), em 4 dígitos hexadecimais maiúsculos. */
export function crc16(payload: string): string {
  let crc = 0xffff;
  for (let i = 0; i < payload.length; i++) {
    crc ^= payload.charCodeAt(i) << 8;
    for (let bit = 0; bit < 8; bit++) {
      crc = crc & 0x8000 ? (crc << 1) ^ 0x1021 : crc << 1;
      crc &= 0xffff;
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, "0");
}

export type PixPayloadInput = {
  /** Chave já normalizada (normalizePixKey). */
  key: string;
  merchantName: string;
  merchantCity: string;
  /** Valor em reais; omitido = o pagador digita. */
  amount?: number | null;
  txid?: string;
};

export function buildPixPayload({ key, merchantName, merchantCity, amount, txid = "***" }: PixPayloadInput): string {
  if (amount !== undefined && amount !== null && !(amount > 0)) throw new Error("Valor do Pix precisa ser maior que zero.");
  const parts = [
    field("00", "01"),
    field("26", field("00", "br.gov.bcb.pix") + field("01", key)),
    field("52", "0000"),
    field("53", "986"),
    amount ? field("54", amount.toFixed(2)) : "",
    field("58", "BR"),
    field("59", pixMerchantName(merchantName)),
    field("60", pixMerchantCity(merchantCity)),
    field("62", field("05", txid)),
  ].join("");
  const withCrcId = `${parts}6304`;
  return withCrcId + crc16(withCrcId);
}
