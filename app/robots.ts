import type { MetadataRoute } from "next";

// Só a página de login pode aparecer em buscador. Orçamento de cliente (/o/) nunca:
// além do bloqueio aqui, todas as respostas levam X-Robots-Tag noindex (next.config.ts).
// Os leitores de prévia de link (WhatsApp, Facebook, Telegram) podem ler /o/ para montar a prévia;
// não são buscadores e continuam recebendo o noindex.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      { userAgent: "*", allow: "/login", disallow: "/" },
      {
        userAgent: ["WhatsApp", "facebookexternalhit", "Facebot", "TelegramBot"],
        allow: ["/login", "/o/"],
        disallow: "/",
      },
    ],
  };
}
