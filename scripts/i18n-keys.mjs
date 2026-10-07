// Manutenção dos catálogos planos de src/renderer/i18n/locales.
//
//   node scripts/i18n-keys.mjs add <<'EOF'
//   { "chave.nova": { "pt-BR": "Texto", "en": "Text" } }
//   EOF
//   node scripts/i18n-keys.mjs remove chave.exata 'prefixo.*'
//
// "add" grava pt-BR e en e copia o texto em inglês para it, es, de, pl e ja
// (tradução pendente, feita na onda D). Mantém a ordenação (localeCompare "en"),
// a indentação de 2 espaços e a quebra de linha final dos arquivos atuais.
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const DIR = join(process.cwd(), "src/renderer/i18n/locales");
const LOCALES = ["pt-BR", "en", "it", "es", "de", "pl", "ja"];

const load = (lng) => JSON.parse(readFileSync(join(DIR, `${lng}.json`), "utf-8"));

function save(lng, catalog) {
  const keys = Object.keys(catalog).sort((a, b) => a.localeCompare(b, "en"));
  const sorted = Object.fromEntries(keys.map((k) => [k, catalog[k]]));
  writeFileSync(join(DIR, `${lng}.json`), JSON.stringify(sorted, null, 2) + "\n", "utf-8");
}

const [command, ...args] = process.argv.slice(2);

if (command === "add") {
  const patch = JSON.parse(readFileSync(0, "utf-8"));
  for (const [key, value] of Object.entries(patch)) {
    if (typeof value?.["pt-BR"] !== "string" || typeof value?.en !== "string") {
      throw new Error(`"${key}" precisa de "pt-BR" e "en"`);
    }
  }
  for (const lng of LOCALES) {
    const catalog = load(lng);
    for (const [key, value] of Object.entries(patch)) {
      catalog[key] = lng === "pt-BR" ? value["pt-BR"] : value.en;
    }
    save(lng, catalog);
  }
  console.log(`${Object.keys(patch).length} chave(s) adicionada(s) em ${LOCALES.length} idiomas`);
} else if (command === "remove" && args.length > 0) {
  const matches = (key) =>
    args.some((p) => (p.endsWith(".*") ? key.startsWith(p.slice(0, -1)) : key === p));
  let removed = 0;
  for (const lng of LOCALES) {
    const catalog = load(lng);
    for (const key of Object.keys(catalog)) {
      if (matches(key)) {
        delete catalog[key];
        if (lng === "pt-BR") removed += 1;
      }
    }
    save(lng, catalog);
  }
  console.log(`${removed} chave(s) removida(s) de ${LOCALES.length} idiomas`);
} else {
  console.error("uso: node scripts/i18n-keys.mjs add < patch.json | remove <chave|prefixo.*> [...]");
  process.exit(1);
}
