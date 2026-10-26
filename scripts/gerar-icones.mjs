// Gera favicon e ícones do PWA a partir do "V" do logo (sem o texto),
// em fundo grafite. Uso: node scripts/gerar-icones.mjs
import sharp from "sharp";

const SRC = "public/logo-claro.png"; // transparente, cores originais
const BG = "#16171b";

// Recorta só o "V": linhas acima do texto "vindra".
const { data, info } = await sharp(SRC).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
let minX = info.width, maxX = 0, minY = info.height, maxY = 0;
for (let y = 0; y < info.height; y++) {
  for (let x = 0; x < info.width; x++) {
    const i = (y * info.width + x) * 4;
    const [r, g, a] = [data[i], data[i + 1], data[i + 3]];
    const isGreen = a > 32 && g > r + 40; // texto é grafite; o "V" é verde
    if (isGreen) {
      minX = Math.min(minX, x); maxX = Math.max(maxX, x);
      minY = Math.min(minY, y); maxY = Math.max(maxY, y);
    }
  }
}
const mark = await sharp(SRC)
  .extract({ left: minX, top: minY, width: maxX - minX + 1, height: maxY - minY + 1 })
  .png()
  .toBuffer();

/** Ícone quadrado: o "V" ocupa `scale` do lado, centralizado. */
async function icon(size, scale, out, radius = 0) {
  const inner = Math.round(size * scale);
  const v = await sharp(mark).resize(inner, inner, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } }).toBuffer();
  const bg = radius
    ? Buffer.from(`<svg width="${size}" height="${size}"><rect width="${size}" height="${size}" rx="${radius}" fill="${BG}"/></svg>`)
    : { create: { width: size, height: size, channels: 4, background: BG } };
  await sharp(bg).composite([{ input: v, gravity: "center" }]).png().toFile(out);
}

await icon(512, 0.62, "public/icons/icon-512.png");
await icon(192, 0.62, "public/icons/icon-192.png");
// maskable: o "V" dentro da zona segura (círculo de 80%)
await icon(512, 0.5, "public/icons/icon-maskable-512.png");
await icon(180, 0.62, "app/apple-icon.png");
await icon(64, 0.7, "app/icon.png", 14);
console.log("ícones gerados; V em", { minX, minY, maxX, maxY });
