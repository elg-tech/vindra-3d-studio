import { Skeleton } from "@/components/ui/skeleton";

/** Esqueleto de carregamento no formato da página: lista, painel com números, formulário ou quadro. */
export function PageSkeleton({ variant }: { variant: "list" | "dashboard" | "form" | "board" }) {
  return (
    <div className="grid gap-6" role="status" aria-busy="true" aria-label="Carregando">
      <div className="flex items-end justify-between gap-3">
        <Skeleton className="h-9 w-48" />
        {variant !== "dashboard" && <Skeleton className="h-9 w-32" />}
      </div>
      {variant === "dashboard" && (
        <>
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            {Array.from({ length: 4 }, (_, i) => (
              <Skeleton key={i} className="h-28 rounded-xl" />
            ))}
          </div>
          <Skeleton className="h-64 rounded-xl" />
        </>
      )}
      {variant === "list" && (
        <div className="grid gap-2">
          {Array.from({ length: 6 }, (_, i) => (
            <Skeleton key={i} className="h-16 rounded-xl" />
          ))}
        </div>
      )}
      {variant === "form" && (
        <div className="grid gap-4 lg:grid-cols-[2fr_1fr]">
          <Skeleton className="h-96 rounded-xl" />
          <Skeleton className="h-56 rounded-xl" />
        </div>
      )}
      {variant === "board" && (
        <div className="flex gap-3 overflow-hidden">
          {Array.from({ length: 4 }, (_, i) => (
            <Skeleton key={i} className="h-80 min-w-60 flex-1 rounded-xl" />
          ))}
        </div>
      )}
    </div>
  );
}
