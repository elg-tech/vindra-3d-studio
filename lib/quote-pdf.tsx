/* eslint-disable jsx-a11y/alt-text -- o Image do @react-pdf desenha no PDF; não é <img> e não tem alt */
import "server-only";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { Document, Font, Image, Page, StyleSheet, Text, View, renderToBuffer } from "@react-pdf/renderer";
import QRCode from "qrcode";
import { formatCurrency, formatDate } from "@/lib/format";
import { pdfText } from "@/lib/pdf-text";
import type { QuoteDocument } from "@/lib/quote-document";
import { QUOTE_STATUS_LABEL, formatDay } from "@/lib/quotes";

/**
 * PDF do orçamento (A4) com a identidade da Vindra. Helvetica embutida:
 * todo texto passa por pdfText (sem "−", "→" ou emoji, que a fonte não tem).
 */

// sem separação de sílabas: o react-pdf inseriria "-" ao quebrar palavras (e no Pix copia e cola,
// que deixaria de funcionar se copiado do PDF)
Font.registerHyphenationCallback((word) => [word]);

/** Pix copia e cola em linhas de tamanho fixo: quebra sem inserir nenhum caractere. */
const chunk = (text: string, size: number) => text.match(new RegExp(`.{1,${size}}`, "g")) ?? [];

const BRAND = "#0e7f6b";
const INK = "#16171b";
const MUTED = "#5b5f69";
const LINE = "#e3e4e8";

const s = StyleSheet.create({
  page: { paddingTop: 36, paddingBottom: 56, paddingHorizontal: 40, fontFamily: "Helvetica", fontSize: 10, color: INK },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 20 },
  logo: { width: 64, height: 57, objectFit: "contain" },
  storeBlock: { alignItems: "flex-end", gap: 2 },
  storeName: { fontFamily: "Helvetica-Bold", fontSize: 12 },
  muted: { color: MUTED },
  titleRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end", marginBottom: 14 },
  title: { fontFamily: "Helvetica-Bold", fontSize: 18 },
  badge: { fontSize: 9, color: "#ffffff", backgroundColor: MUTED, paddingVertical: 2, paddingHorizontal: 6, borderRadius: 3 },
  meta: { flexDirection: "row", gap: 24, marginBottom: 16 },
  metaLabel: { fontSize: 8, color: MUTED, textTransform: "uppercase", marginBottom: 2 },
  tableHead: {
    flexDirection: "row",
    backgroundColor: BRAND,
    color: "#ffffff",
    fontFamily: "Helvetica-Bold",
    paddingVertical: 5,
    paddingHorizontal: 6,
  },
  row: { flexDirection: "row", paddingVertical: 6, paddingHorizontal: 6, borderBottomWidth: 1, borderBottomColor: LINE },
  cDesc: { flex: 1, paddingRight: 8 },
  cQty: { width: 40, textAlign: "right" },
  cUnit: { width: 80, textAlign: "right" },
  cTotal: { width: 84, textAlign: "right" },
  totals: { alignSelf: "flex-end", width: 220, marginTop: 10, gap: 3 },
  totalRow: { flexDirection: "row", justifyContent: "space-between" },
  grandTotal: {
    flexDirection: "row",
    justifyContent: "space-between",
    borderTopWidth: 1,
    borderTopColor: INK,
    paddingTop: 5,
    marginTop: 3,
    fontFamily: "Helvetica-Bold",
    fontSize: 13,
  },
  section: { marginTop: 18, gap: 4 },
  sectionTitle: { fontFamily: "Helvetica-Bold", fontSize: 11, marginBottom: 2 },
  pix: { marginTop: 18, flexDirection: "row", gap: 14, borderWidth: 1, borderColor: LINE, borderRadius: 4, padding: 10 },
  qr: { width: 110, height: 110 },
  payload: { fontFamily: "Courier", fontSize: 7, color: MUTED, marginTop: 4 },
  footer: {
    position: "absolute",
    bottom: 24,
    left: 40,
    right: 40,
    flexDirection: "row",
    justifyContent: "space-between",
    fontSize: 8,
    color: MUTED,
    borderTopWidth: 1,
    borderTopColor: LINE,
    paddingTop: 6,
  },
});

/** Texto seguro para a Helvetica. */
const t = (value: string) => pdfText(value);
const money = (value: number) => t(formatCurrency(value));

function QuotePdf({ q, logo, qr }: { q: QuoteDocument; logo: Buffer | null; qr: string | null }) {
  const { totals, store, pix } = q;
  const terms = q.payment_terms ?? store.terms;
  const contacts = [store.whatsapp && `WhatsApp ${store.whatsapp}`, store.instagram && `@${store.instagram}`, store.email]
    .filter(Boolean)
    .join("  ·  ");

  return (
    <Document title={t(`Orçamento ${q.number}`)} author={t(store.name)} language="pt-BR">
      <Page size="A4" style={s.page}>
        <View style={s.header}>
          {logo ? <Image src={logo} style={s.logo} /> : <Text style={s.storeName}>{t(store.name)}</Text>}
          <View style={s.storeBlock}>
            <Text style={s.storeName}>{t(store.name)}</Text>
            {store.city && <Text style={s.muted}>{t(store.city)}</Text>}
            {contacts && <Text style={s.muted}>{t(contacts)}</Text>}
          </View>
        </View>

        <View style={s.titleRow}>
          <Text style={s.title}>{t(`Orçamento ${q.number}`)}</Text>
          {q.status !== "sent" && <Text style={s.badge}>{t(QUOTE_STATUS_LABEL[q.status].toUpperCase())}</Text>}
        </View>

        <View style={s.meta}>
          {q.customer_name && (
            <View>
              <Text style={s.metaLabel}>Cliente</Text>
              <Text>{t(q.customer_name)}</Text>
            </View>
          )}
          <View>
            <Text style={s.metaLabel}>Emissão</Text>
            <Text>{formatDate(q.sent_at ?? q.created_at)}</Text>
          </View>
          {q.valid_until && (
            <View>
              <Text style={s.metaLabel}>Válido até</Text>
              <Text>{formatDay(q.valid_until)}</Text>
            </View>
          )}
          {q.production_days !== null && (
            <View>
              <Text style={s.metaLabel}>Produção</Text>
              <Text>{t(`até ${q.production_days} ${q.production_days === 1 ? "dia útil" : "dias úteis"}`)}</Text>
            </View>
          )}
        </View>

        <View style={s.tableHead}>
          <Text style={s.cDesc}>Item</Text>
          <Text style={s.cQty}>Qtd.</Text>
          <Text style={s.cUnit}>Unitário</Text>
          <Text style={s.cTotal}>Total</Text>
        </View>
        {q.items.map((item, i) => (
          <View key={i} style={s.row} wrap={false}>
            <Text style={s.cDesc}>{t(item.description)}</Text>
            <Text style={s.cQty}>{item.quantity}</Text>
            <Text style={s.cUnit}>{money(item.unit_price)}</Text>
            <Text style={s.cTotal}>{money(item.quantity * item.unit_price)}</Text>
          </View>
        ))}

        <View style={s.totals} wrap={false}>
          <View style={s.totalRow}>
            <Text style={s.muted}>Subtotal</Text>
            <Text>{money(totals.subtotal)}</Text>
          </View>
          {totals.discount > 0 && (
            <View style={s.totalRow}>
              <Text style={s.muted}>Desconto</Text>
              <Text>{t(`- ${formatCurrency(totals.discount)}`)}</Text>
            </View>
          )}
          {totals.shipping > 0 && (
            <View style={s.totalRow}>
              <Text style={s.muted}>Frete</Text>
              <Text>{money(totals.shipping)}</Text>
            </View>
          )}
          <View style={s.grandTotal}>
            <Text>Total</Text>
            <Text>{money(totals.total)}</Text>
          </View>
          {totals.deposit !== null && (
            <View style={s.totalRow}>
              <Text style={s.muted}>{t(`Sinal (${String(q.deposit_pct).replace(".", ",")}%)`)}</Text>
              <Text>{money(totals.deposit)}</Text>
            </View>
          )}
        </View>

        {terms && (
          <View style={s.section} wrap={false}>
            <Text style={s.sectionTitle}>Condições de pagamento</Text>
            <Text>{t(terms)}</Text>
          </View>
        )}
        {q.notes && (
          <View style={s.section}>
            <Text style={s.sectionTitle}>Observações</Text>
            <Text>{t(q.notes)}</Text>
          </View>
        )}

        {pix && qr && q.status !== "rejected" && q.status !== "expired" && (
          <View style={s.pix} wrap={false}>
            <Image src={qr} style={s.qr} />
            <View style={{ flex: 1, gap: 3 }}>
              <Text style={s.sectionTitle}>Pagar com Pix</Text>
              <Text>{t(`${pix.label}: ${formatCurrency(pix.amount)}`)}</Text>
              <Text style={s.muted}>{t(`Chave: ${pix.key}`)}</Text>
              <Text style={s.muted}>
                {t("Leia o QR Code no app do banco ou use o Pix copia e cola abaixo. O valor já vem preenchido.")}
              </Text>
              <Text style={s.payload}>{chunk(pix.payload, 62).join("\n")}</Text>
            </View>
          </View>
        )}

        <View style={s.footer} fixed>
          <Text>{t(`${store.name} · Orçamento ${q.number}`)}</Text>
          <Text render={({ pageNumber, totalPages }) => `Página ${pageNumber} de ${totalPages}`} />
        </View>
      </Page>
    </Document>
  );
}

let logoCache: Buffer | null | undefined;
async function loadLogo(): Promise<Buffer | null> {
  if (logoCache === undefined) {
    // incluído no deploy por outputFileTracingIncludes (next.config.ts)
    logoCache = await readFile(path.join(process.cwd(), "public", "logo-claro.png")).catch(() => null);
  }
  return logoCache;
}

export async function renderQuotePdf(q: QuoteDocument): Promise<Buffer> {
  const [logo, qr] = await Promise.all([
    loadLogo(),
    q.pix ? QRCode.toDataURL(q.pix.payload, { margin: 1, width: 360, errorCorrectionLevel: "M" }) : null,
  ]);
  return renderToBuffer(<QuotePdf q={q} logo={logo} qr={qr} />);
}

/** Nome do arquivo: "orcamento-VND-2026-0001.pdf". */
export const quotePdfFilename = (q: Pick<QuoteDocument, "number">) => `orcamento-${q.number}.pdf`;
