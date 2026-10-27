import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // o PDF do orçamento lê o logo do disco: garante o arquivo junto da função no deploy
  outputFileTracingIncludes: {
    "/o/[token]/pdf": ["./public/logo-claro.png"],
    "/orcamentos/[id]/pdf": ["./public/logo-claro.png"],
    "/o/[token]/opengraph-image": ["./public/logo-escuro.png"],
  },
  images: {
    // fotos dos produtos ficam no bucket público "product-images" do Supabase
    remotePatterns: process.env.NEXT_PUBLIC_SUPABASE_URL
      ? [new URL(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/**`)]
      : [],
  },
};

export default nextConfig;
