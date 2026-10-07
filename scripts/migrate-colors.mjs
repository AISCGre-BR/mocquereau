// Codemod da onda A1: troca utilitários de cor crua do Tailwind por tokens do
// Parchment Design. Temporário: removido quando PENDING (color-guard.test.ts) esvaziar.
// Uso: node scripts/migrate-colors.mjs <arquivo.tsx> [...]
import { readFileSync, writeFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

const FAMILY = {
  gray: "gray", slate: "gray", zinc: "gray", neutral: "gray", stone: "gray",
  blue: "action",
  sky: "info", cyan: "info", indigo: "info",
  red: "danger", rose: "danger",
  orange: "warning", amber: "warning", yellow: "warning",
  green: "success", emerald: "success", teal: "success", lime: "success",
  purple: "murex", violet: "murex", fuchsia: "murex", pink: "murex",
};
const WASH = {
  action: "rubric-wash", info: "lapis-wash", danger: "rubric-wash",
  warning: "orpiment-wash", success: "verdigris-wash", murex: "murex-wash",
};
const SOLID = {
  action: "rubric", info: "lapis", danger: "danger",
  warning: "warning", success: "success", murex: "murex",
};

const TOKEN =
  /(?<![\w-])((?:[a-z-]+:)*)(bg|text|border(?:-[trblxy])?|ring|from|to|via|outline|divide|fill|stroke|placeholder|accent|decoration|caret)-(white|black|(?:gray|slate|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)-\d{2,3})(\/\d{1,3})?(?![\w-])/g;

function kindOf(prop) {
  if (prop === "text" || prop === "placeholder" || prop === "decoration" || prop === "caret") return "ink";
  if (prop.startsWith("border") || prop === "ring" || prop === "outline" || prop === "divide" || prop === "stroke") return "line";
  return "fill";
}

function grayToken(kind, shade, interactive) {
  if (kind === "ink") return shade >= 800 ? "ink" : shade >= 600 ? "ink-soft" : "ink-muted";
  if (kind === "line") return shade <= 200 ? "rule-soft" : shade <= 300 ? "rule" : "rule-strong";
  if (interactive && shade <= 300) return "ink-wash";
  if (shade <= 50) return "parchment";
  if (shade <= 100) return "parchment-deep";
  if (shade <= 200) return "rule-soft";
  if (shade <= 300) return "rule";
  if (shade <= 500) return "rule-strong";
  return "ink-soft";
}

function hueToken(family, kind, shade, interactive) {
  if (kind === "ink") return SOLID[family];
  if (kind === "line") return family === "action" && shade <= 200 ? "rubric-soft" : SOLID[family];
  if (family === "action") {
    if (shade <= 200) return "rubric-wash";
    if (shade <= 500) return "rubric-soft";
    if (shade === 600) return "rubric";
    if (shade === 700) return interactive ? "rubric-soft" : "rubric";
    return "rubric-deep";
  }
  return shade <= 200 ? WASH[family] : SOLID[family];
}

export function mapColorToken(variants, prop, color, opacity = "") {
  const kind = kindOf(prop);
  const interactive = variants
    .split(":")
    .some((v) => v === "hover" || v === "active" || v === "group-hover");
  let token;
  if (color === "white") {
    token = kind === "ink" ? "on-rubric" : "surface";
  } else if (color === "black") {
    token = "ink";
    if (kind === "fill") opacity = "/20";
  } else {
    const [, hue, shadeText] = color.match(/^([a-z]+)-(\d+)$/);
    const shade = Number(shadeText);
    const family = FAMILY[hue];
    token = family === "gray"
      ? grayToken(kind, shade, interactive)
      : hueToken(family, kind, shade, interactive);
  }
  if (prop === "ring" && (token === "rubric" || token === "rubric-soft")) token = "focus";
  if (token.endsWith("wash")) opacity = "";
  return `${variants}${prop}-${token}${opacity}`;
}

export function migrateSource(source) {
  return source.replace(TOKEN, (_match, variants, prop, color, opacity) =>
    mapColorToken(variants, prop, color, opacity ?? ""),
  );
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const files = process.argv.slice(2);
  if (files.length === 0) {
    console.error("uso: node scripts/migrate-colors.mjs <arquivo.tsx> [...]");
    process.exit(1);
  }
  for (const file of files) {
    const before = readFileSync(file, "utf-8");
    const after = migrateSource(before);
    if (after !== before) writeFileSync(file, after, "utf-8");
    console.log(`${file}: ${after === before ? "sem mudanças" : "migrado"}`);
  }
}
