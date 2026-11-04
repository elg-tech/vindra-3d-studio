"use client";

import { formatCurrency, formatGrams, formatNumber } from "@/lib/format";
import { type CostResult, productionPlan } from "@/lib/pricing";
import { CostBreakdown } from "./cost-breakdown";

/** 116 → "1h 56min"; 23,2 → "23 min". */
export function formatMinutes(minutes: number): string {
  const total = Math.round(minutes);
  const h = Math.floor(total / 60);
  return h > 0 ? `${h}h ${String(total % 60).padStart(2, "0")}min` : `${total} min`;
}

const round1 = (n: number) => Math.round(n * 10) / 10;

/**
 * Resultado da PRODUÇÃO: custo da mesa, custo/tempo/gramas por peça e a composição. Com "Quero produzir X
 * peças", o lote: mesas (a última incompleta conta inteira de tempo e máquina), tempo, filamento e custo.
 */
export function ProductionResult({
  result,
  piecesPerPlate,
  plannedPieces,
  failureMarginPct,
}: {
  result: CostResult;
  piecesPerPlate: number;
  /** Peças do "Quero produzir"; null = campo vazio. */
  plannedPieces: number | null;
  failureMarginPct: number;
}) {
  const plan = plannedPieces !== null && plannedPieces >= 1 ? productionPlan(result, plannedPieces) : null;
  const incomplete = plan !== null && plan.lastPlatePieces < piecesPerPlate;

  return (
    <div className="grid gap-4">
      <div className="flex items-end justify-between gap-3">
        <div>
          <p className="text-sm text-muted-foreground">Custo por peça</p>
          <p className="text-3xl font-semibold tracking-tight tabular-nums">{formatCurrency(result.piece.total)}</p>
        </div>
        <p className="text-right text-xs text-muted-foreground">falha {formatNumber(failureMarginPct)}% na produção</p>
      </div>

      <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4 lg:grid-cols-2">
        <div className="rounded-lg bg-muted/50 px-3 py-2">
          <dt className="text-xs text-muted-foreground">Custo da mesa</dt>
          <dd className="font-medium tabular-nums">{formatCurrency(result.plate.total)}</dd>
          <dd className="text-xs text-muted-foreground">filamento + máquina</dd>
        </div>
        <div className="rounded-lg bg-muted/50 px-3 py-2">
          <dt className="text-xs text-muted-foreground">Peças por mesa</dt>
          <dd className="font-medium tabular-nums">{piecesPerPlate}</dd>
          <dd className="text-xs text-muted-foreground tabular-nums">mesa: {formatMinutes(result.plate.minutes)}</dd>
        </div>
        <div className="rounded-lg bg-muted/50 px-3 py-2">
          <dt className="text-xs text-muted-foreground">Tempo por peça</dt>
          <dd className="font-medium tabular-nums">{formatMinutes(result.pieceMinutes)}</dd>
        </div>
        <div className="rounded-lg bg-muted/50 px-3 py-2">
          <dt className="text-xs text-muted-foreground">Gramas por peça</dt>
          <dd className="font-medium tabular-nums">{formatGrams(round1(result.pieceGrams))}</dd>
        </div>
      </dl>

      <CostBreakdown unit={result.piece} suppliesLabel="Insumos por peça" />

      {plan && (
        <section aria-labelledby="plano" className="grid gap-2 rounded-lg border p-3">
          <h3 id="plano" className="text-sm font-semibold">
            Produzir {plan.pieces} {plan.pieces === 1 ? "peça" : "peças"}
          </h3>
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
            <dt className="text-muted-foreground">Mesas</dt>
            <dd className="text-right tabular-nums">
              {plan.plates}
              {incomplete && (
                <span className="text-xs text-muted-foreground">
                  {" "}
                  (última com {plan.lastPlatePieces} de {piecesPerPlate})
                </span>
              )}
            </dd>
            <dt className="text-muted-foreground">Tempo total</dt>
            <dd className="text-right tabular-nums">{formatMinutes(plan.minutes)}</dd>
            <dt className="text-muted-foreground">Filamento total</dt>
            <dd className="text-right tabular-nums">{formatGrams(round1(plan.grams))}</dd>
            <dt className="border-t pt-1 font-medium">Custo total</dt>
            <dd className="border-t pt-1 text-right font-semibold tabular-nums">{formatCurrency(plan.cost)}</dd>
            <dd className="col-span-2 text-xs text-muted-foreground tabular-nums">
              {formatCurrency(plan.costPerPiece)} por peça neste lote
              {incomplete && " (a última mesa incompleta paga tempo e máquina inteiros)"}. A venda usa o custo da mesa cheia.
            </dd>
          </dl>
        </section>
      )}
    </div>
  );
}
