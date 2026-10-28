import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { ThemeProvider } from "@/components/theme-provider";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { publicEnv } from "@/lib/env";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
  // usada em dois lugares do painel: baixa só quando aparece (não pesa na página pública)
  preload: false,
});

export const metadata: Metadata = {
  // links absolutos (imagem da prévia do orçamento no WhatsApp) sempre no domínio oficial
  metadataBase: new URL(publicEnv.NEXT_PUBLIC_SITE_URL),
  title: {
    default: "Vindra 3D Studio",
    template: "%s · Vindra 3D Studio",
  },
  description: "Gestão da Vindra 3D: custos, filamentos, orçamentos e pedidos.",
  applicationName: "Vindra 3D Studio",
  appleWebApp: {
    capable: true,
    title: "Vindra 3D",
    statusBarStyle: "black-translucent",
  },
  formatDetection: { telephone: false },
  // app privado: nada indexado (a página de login libera; ver app/robots.ts)
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  // Tema padrão é escuro; o ThemeProvider atualiza ao trocar.
  themeColor: "#16171b",
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="pt-BR"
      className={`${geistSans.variable} ${geistMono.variable}`}
      suppressHydrationWarning
    >
      <body className="antialiased">
        <ThemeProvider>
          <TooltipProvider>
            {children}
            <Toaster richColors position="top-center" />
          </TooltipProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
