/**
 * A Helvetica embutida no PDF usa a codificação WinAnsi (Latin-1 + alguns símbolos).
 * Acentos do português estão lá; "−", "→" e emoji não: viram equivalentes ou saem.
 */
const REPLACEMENTS: Record<string, string> = {
  "−": "-", // sinal de menos
  "→": "->",
  "←": "<-",
  "…": "...",
  "≤": "<=",
  "≥": ">=",
  "✓": "v",
  "✔": "v",
};

// caracteres acima de 0xFF que existem no WinAnsi
const WIN_ANSI_EXTRAS = new Set("€‚ƒ„†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ");

export function pdfText(text: string): string {
  let out = "";
  for (const ch of text.normalize("NFC")) {
    const replacement = REPLACEMENTS[ch];
    if (replacement !== undefined) out += replacement;
    else if (ch.codePointAt(0)! <= 0xff || WIN_ANSI_EXTRAS.has(ch)) out += ch;
  }
  // emoji removido deixa espaço duplo
  return out.replace(/ {2,}/g, " ");
}
