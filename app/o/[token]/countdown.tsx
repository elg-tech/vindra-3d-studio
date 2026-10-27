"use client";

import { useSyncExternalStore } from "react";

/** Fim do último dia da validade, no horário de Brasília (sem horário de verão desde 2019). */
const endOfDay = (isoDate: string) => new Date(`${isoDate}T23:59:59-03:00`).getTime();

function remaining(ms: number): string {
  const minutes = Math.floor(ms / 60_000);
  const days = Math.floor(minutes / 1440);
  const hours = Math.floor((minutes % 1440) / 60);
  if (days > 0) return `${days} ${days === 1 ? "dia" : "dias"} e ${hours} h`;
  if (hours > 0) return `${hours} h e ${minutes % 60} min`;
  return `${Math.max(minutes, 1)} min`;
}

// relógio arredondado ao minuto: o valor fica estável entre leituras do mesmo minuto
const subscribe = (onChange: () => void) => {
  const timer = setInterval(onChange, 15_000);
  return () => clearInterval(timer);
};
const minuteNow = () => Math.floor(Date.now() / 60_000) * 60_000;

/** "Faltam 3 dias e 4 h" (atualiza a cada minuto). No servidor não aparece: a página já mostra a data. */
export function Countdown({ validUntil }: { validUntil: string }) {
  const now = useSyncExternalStore(subscribe, minuteNow, () => null);

  if (now === null) return null;
  const ms = endOfDay(validUntil) - now;
  if (ms <= 0) return <span className="text-destructive">Prazo encerrado</span>;
  return <span className="tabular-nums">Faltam {remaining(ms)}</span>;
}
