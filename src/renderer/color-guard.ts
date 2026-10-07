// Varredura de cores cruas usada pelo teste de guarda (color-guard.test.ts).
// Função pura, sem fs: o teste lê os arquivos. Não é importada pelo app.

const PALETTE =
  /(?<![\w-])(?:[a-z-]+:)*(?:bg|text|border(?:-[trblxy])?|ring|from|to|via|outline|divide|fill|stroke|placeholder|accent|decoration|caret)-(?:gray|slate|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)-\d+(?:\/\d+)?/;
const MONO =
  /(?<![\w-])(?:[a-z-]+:)*(?:bg|text|border(?:-[trblxy])?|ring|outline|divide|fill|stroke)-(?:white|black)(?:\/\d+)?(?![\w-])/;
const HEX = /(?<![&\w])#[0-9a-fA-F]{3,8}(?!\w)/;
const COLOR_FN = /\b(?:rgb|rgba|hsl|hsla)\(/;

/** Lista as ocorrências proibidas, uma por padrão e linha: "<linha>: <trecho>". */
export function violations(source: string): string[] {
  const found: string[] = [];
  source.split("\n").forEach((raw, index) => {
    const line = raw.replace(/\/\/.*$/, "").replace(/\{\/\*.*?\*\/\}/g, "");
    for (const pattern of [PALETTE, MONO, HEX, COLOR_FN]) {
      const match = line.match(pattern);
      if (match) found.push(`${index + 1}: ${match[0]}`);
    }
  });
  return found;
}
