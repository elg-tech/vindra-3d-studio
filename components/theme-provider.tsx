"use client";

import { ThemeProvider as NextThemesProvider, useTheme } from "next-themes";
import { useEffect } from "react";

const THEME_COLORS = { dark: "#16171b", light: "#faf8f3" } as const;

/** Mantém a cor da barra do navegador (celular) igual ao tema escolhido. */
function ThemeColorSync() {
  const { resolvedTheme } = useTheme();

  useEffect(() => {
    const color = resolvedTheme === "light" ? THEME_COLORS.light : THEME_COLORS.dark;
    document.querySelectorAll('meta[name="theme-color"]').forEach((meta) => {
      meta.setAttribute("content", color);
    });
  }, [resolvedTheme]);

  return null;
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  return (
    <NextThemesProvider attribute="class" defaultTheme="dark" enableSystem disableTransitionOnChange>
      <ThemeColorSync />
      {children}
    </NextThemesProvider>
  );
}
