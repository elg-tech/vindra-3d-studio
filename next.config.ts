import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    // fotos dos produtos ficam no bucket público "product-images" do Supabase
    remotePatterns: process.env.NEXT_PUBLIC_SUPABASE_URL
      ? [new URL(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/**`)]
      : [],
  },
};

export default nextConfig;
