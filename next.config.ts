import type { NextConfig } from "next";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseOrigin = supabaseUrl ? new URL(supabaseUrl).origin : "";
const isDev = process.env.NODE_ENV === "development";
// a barra de comentários da Vercel só aparece nos previews
const vercelLive = process.env.VERCEL_ENV === "preview" ? "https://vercel.live" : "";

// CSP sem nonce: o nonce obrigaria todas as páginas a renderizar por requisição.
// 'unsafe-inline' em script/style fica por causa do next-themes (script do tema) e dos estilos
// inline do Radix e do Recharts; o ganho real está em connect/img/frame/form/object/base.
const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""} ${vercelLive}`,
  "style-src 'self' 'unsafe-inline'",
  // fotos do Storage (diretas ou via /_next/image), prévia da foto escolhida (blob:) e QR do Pix (SVG inline/data:)
  `img-src 'self' data: blob: ${supabaseOrigin} ${vercelLive}`,
  "font-src 'self' data:",
  // Supabase: auth, banco e upload das fotos direto do navegador
  `connect-src 'self' ${supabaseOrigin} ${supabaseOrigin.replace("https://", "wss://")} ${vercelLive}`,
  `frame-src ${vercelLive || "'none'"}`,
  "worker-src 'self' blob:",
  "manifest-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  ...(isDev ? [] : ["upgrade-insecure-requests"]),
]
  .map((d) => d.replace(/\s+/g, " ").trim())
  .join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: csp },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), payment=(), usb=(), browsing-topics=()",
  },
  ...(isDev ? [] : [{ key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" }]),
];

const nextConfig: NextConfig = {
  // o PDF do orçamento lê o logo do disco: garante o arquivo junto da função no deploy
  outputFileTracingIncludes: {
    "/o/[token]/pdf": ["./public/logo-claro.png"],
    "/orcamentos/[id]/pdf": ["./public/logo-claro.png"],
    "/o/[token]/opengraph-image": ["./public/logo-escuro.png"],
  },
  images: {
    // fotos dos produtos ficam no bucket público "product-images" do Supabase
    remotePatterns: supabaseUrl ? [new URL(`${supabaseUrl}/storage/v1/object/public/**`)] : [],
  },
  async headers() {
    return [
      { source: "/:path*", headers: securityHeaders },
      // nada do app vai para buscadores; só a página de login pode ser indexada
      { source: "/((?!login$).*)", headers: [{ key: "X-Robots-Tag", value: "noindex, nofollow" }] },
      // orçamento do cliente: o link (com o token) nunca sai no Referer
      { source: "/o/:path*", headers: [{ key: "Referrer-Policy", value: "no-referrer" }] },
    ];
  },
};

export default nextConfig;
