// Varredura de cores cruas usada pelo teste de guarda (color-guard.test.ts).
// Função pura, sem fs: o teste lê os arquivos. Não é importada pelo app.

const PALETTE =
  /(?<![\w-])(?:[a-z-]+:)*(?:bg|text|border(?:-[trblxy])?|ring|from|to|via|outline|divide|fill|stroke|placeholder|accent|decoration|caret)-(?:gray|slate|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)-\d+(?:\/\d+)?/;
const MONO =
  /(?<![\w-])(?:[a-z-]+:)*(?:bg|text|border(?:-[trblxy])?|ring|outline|divide|fill|stroke)-(?:white|black)(?:\/\d+)?(?![\w-])/;
const HEX = /(?<![&\w])#[0-9a-fA-F]{3,8}(?!\w)/;
const COLOR_FN = /\b(?:rgb|rgba|hsl|hsla|oklch|oklab|lch|lab|hwb|color-mix)\(/;

// Nomes de cor CSS em atributos/propriedades de cor: style={{ color: "white" }},
// fill="black", stroke='red', backgroundColor: "gray"… (transparent, currentColor,
// none e inherit são permitidos).
const NAMED_COLORS =
  "white|black|red|green|blue|gray|grey|silver|yellow|orange|purple|pink|brown|navy|maroon|olive|teal|aqua|fuchsia|lime|cyan|magenta|gold|indigo|violet|crimson|coral|beige|ivory|khaki|lavender|salmon|tan|turquoise|wheat|whitesmoke|gainsboro";
const NAMED = new RegExp(
  `(?<![\\w-])(?:fill|stroke|color|background|backgroundColor|borderColor|outlineColor|stopColor|stop-color|floodColor|caretColor|textDecorationColor|fillStyle|strokeStyle|shadowColor)\\s*[=:]\\s*\\{?\\s*["'\`](?:${NAMED_COLORS})["'\`]`,
  "i",
);

/**
 * Remove comentários de uma linha sem tocar em strings: "//" dentro de aspas
 * (URLs como "https://…") não corta o resto da linha.
 */
export function stripComments(line: string): string {
  let out = "";
  let quote: string | null = null;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (quote) {
      out += c;
      if (c === "\\") {
        out += line[i + 1] ?? "";
        i++;
      } else if (c === quote) {
        quote = null;
      }
      continue;
    }
    if (c === '"' || c === "'" || c === "`") {
      quote = c;
      out += c;
      continue;
    }
    if (c === "/" && line[i + 1] === "/") break;
    if (c === "/" && line[i + 1] === "*") {
      const end = line.indexOf("*/", i + 2);
      if (end < 0) break;
      i = end + 1;
      continue;
    }
    out += c;
  }
  return out;
}

/** Lista as ocorrências proibidas, uma por padrão e linha: "<linha>: <trecho>". */
export function violations(source: string): string[] {
  const found: string[] = [];
  source.split("\n").forEach((raw, index) => {
    const line = stripComments(raw);
    for (const pattern of [PALETTE, MONO, HEX, COLOR_FN, NAMED]) {
      const match = line.match(pattern);
      if (match) found.push(`${index + 1}: ${match[0]}`);
    }
  });
  return found;
}
