import { readFile } from "node:fs/promises";
import path from "node:path";
import { ImageResponse } from "next/og";
import { formatCurrency } from "@/lib/format";
import { loadPublicQuote } from "@/lib/quote-loaders";
import { formatDay } from "@/lib/quotes";
import { createClient } from "@/lib/supabase/server";

export const alt = "Orçamento da Vindra 3D";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

/** Prévia do link no WhatsApp: logo, número, total e validade. Só leitura. */
export default async function Image({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const [q, logo] = await Promise.all([
    loadPublicQuote(await createClient(), token),
    readFile(path.join(process.cwd(), "public", "logo-escuro.png")).catch(() => null),
  ]);
  const logoSrc = logo ? `data:image/png;base64,${logo.toString("base64")}` : null;

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: 72,
          background: "#16171b",
          color: "#f4f0e8",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 32 }}>
          {/* eslint-disable-next-line @next/next/no-img-element -- ImageResponse só aceita <img> */}
          {logoSrc && <img src={logoSrc} width={164} height={147} alt="" />}
          <div style={{ display: "flex", flexDirection: "column" }}>
            <span style={{ fontSize: 34, color: "#9aa0a6" }}>Orçamento</span>
            <span style={{ fontSize: 64, fontWeight: 700 }}>{q?.number ?? "Vindra 3D"}</span>
          </div>
        </div>
        {q ? (
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end" }}>
            <div style={{ display: "flex", flexDirection: "column" }}>
              <span style={{ fontSize: 32, color: "#9aa0a6" }}>Total</span>
              <span style={{ fontSize: 88, fontWeight: 700, color: "#2bb89a" }}>{formatCurrency(q.totals.total)}</span>
            </div>
            {q.valid_until && (
              <span style={{ fontSize: 32, color: "#9aa0a6" }}>Válido até {formatDay(q.valid_until)}</span>
            )}
          </div>
        ) : (
          <span style={{ fontSize: 40 }}>Impressão 3D sob medida</span>
        )}
      </div>
    ),
    size,
  );
}
