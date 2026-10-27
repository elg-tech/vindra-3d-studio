import { ColorDot } from "@/components/color-dot";

export type BarRow = {
  key: string;
  label: string;
  /** Texto do valor, ao lado da barra. */
  display: string;
  value: number;
  detail?: string;
  /** Cor da barra (série); sem ela, neutra. */
  color?: string;
  /** Bolinha com a cor real (filamento). */
  swatch?: string;
};

/** Barras horizontais com rótulo e valor escritos (a cor nunca é a única pista). */
export function BarList({ rows, empty }: { rows: BarRow[]; empty: string }) {
  if (rows.length === 0) return <p className="py-6 text-center text-sm text-muted-foreground">{empty}</p>;
  const max = Math.max(...rows.map((r) => Math.abs(r.value)), 1);
  return (
    <ul className="grid gap-3">
      {rows.map((r) => (
        <li key={r.key} className="grid gap-1.5">
          <div className="flex items-baseline justify-between gap-3 text-sm">
            <span className="flex min-w-0 items-center gap-2">
              {r.swatch && <ColorDot hex={r.swatch} />}
              <span className="truncate">{r.label}</span>
              {r.detail && <span className="shrink-0 text-xs text-muted-foreground">{r.detail}</span>}
            </span>
            <span className="shrink-0 font-medium tabular-nums">{r.display}</span>
          </div>
          <div className="h-2 rounded-full bg-muted">
            <div
              className="h-full rounded-full"
              style={{
                width: `${Math.max((Math.abs(r.value) / max) * 100, 2)}%`,
                background: r.value < 0 ? "var(--destructive)" : (r.color ?? "var(--chart-5)"),
              }}
            />
          </div>
        </li>
      ))}
    </ul>
  );
}
