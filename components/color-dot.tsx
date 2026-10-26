import { cn } from "@/lib/utils";

/** Bolinha com a cor do filamento (com borda para cores próximas do fundo). */
export function ColorDot({ hex, className, label }: { hex: string; className?: string; label?: string }) {
  return (
    <span
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      className={cn("inline-block size-4 shrink-0 rounded-full border border-foreground/20 shadow-inner", className)}
      style={{ backgroundColor: hex }}
    />
  );
}
