import { Logo } from "@/components/logo";
import { cn } from "@/lib/utils";

/** Tela de aviso com a identidade da Vindra: 404, erro e afins. */
export function StatusScreen({
  code,
  title,
  description,
  actions,
  fullScreen,
}: {
  code?: string;
  title: string;
  description: string;
  actions: React.ReactNode;
  /** fora do layout do app (sem menu): ocupa a tela toda e mostra o logo */
  fullScreen?: boolean;
}) {
  // fora do layout do app ninguém mais fornece o <main>
  const Root = fullScreen ? "main" : "div";
  return (
    <Root
      className={cn(
        "flex flex-col items-center justify-center gap-5 px-4 text-center",
        fullScreen ? "min-h-dvh py-10" : "py-16",
      )}
    >
      {fullScreen && <Logo className="w-24" priority />}
      <div className="grid gap-2">
        {code && <p className="text-sm font-medium tracking-widest text-primary tabular-nums">{code}</p>}
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        <p className="mx-auto max-w-md text-sm text-muted-foreground">{description}</p>
      </div>
      {actions && <div className="flex flex-wrap justify-center gap-2">{actions}</div>}
    </Root>
  );
}
