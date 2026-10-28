"use client";

import "./globals.css";

// Só aparece se o layout raiz falhar: substitui o documento inteiro (sem tema, fontes nem providers).
export default function GlobalError({ retry }: { error: unknown; retry: () => void }) {
  return (
    <html lang="pt-BR" className="dark">
      <body className="antialiased">
        <title>Erro · Vindra 3D Studio</title>
        <main className="flex min-h-dvh flex-col items-center justify-center gap-4 px-4 text-center">
          {/* eslint-disable-next-line @next/next/no-img-element -- sem o layout raiz, img simples é mais seguro */}
          <img src="/logo-escuro.png" alt="Vindra 3D" width={96} height={86} />
          <h1 className="text-2xl font-semibold tracking-tight">Algo deu errado</h1>
          <p className="max-w-md text-sm text-muted-foreground">
            O app não conseguiu carregar. Tente de novo; se continuar, feche e abra o app.
          </p>
          <button
            type="button"
            onClick={() => retry()}
            className="h-11 rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground"
          >
            Tentar de novo
          </button>
        </main>
      </body>
    </html>
  );
}
