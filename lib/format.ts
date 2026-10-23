import { formatInTimeZone } from "date-fns-tz";

export const TIME_ZONE = "America/Sao_Paulo";

const currencyFormatter = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
});

const numberFormatter = new Intl.NumberFormat("pt-BR", {
  maximumFractionDigits: 2,
});

/** Formata um valor em reais: 1234.56 → "R$ 1.234,56". */
export function formatCurrency(value: number): string {
  return currencyFormatter.format(value);
}

/** Formata um número com separadores pt-BR: 1234.5 → "1.234,5". */
export function formatNumber(value: number): string {
  return numberFormatter.format(value);
}

/** Formata uma data em dd/MM/yyyy no fuso de São Paulo. */
export function formatDate(date: Date | string): string {
  return formatInTimeZone(new Date(date), TIME_ZONE, "dd/MM/yyyy");
}

/** Formata data e hora em dd/MM/yyyy HH:mm no fuso de São Paulo. */
export function formatDateTime(date: Date | string): string {
  return formatInTimeZone(new Date(date), TIME_ZONE, "dd/MM/yyyy HH:mm");
}
