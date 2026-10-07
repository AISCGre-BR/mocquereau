// Fixture sintética para o visual-check: projeto v3 mínimo com duas fontes e páginas
// geradas aqui (SVG). Nenhuma imagem real de manuscrito entra no repositório.
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { transformWithEsbuild } from "vite";

// A lista sugerida vive em TypeScript (src/shared/classification.ts): transpilada em memória
// para o fixture usar a mesma fonte da verdade, sem depender de suporte a .ts do Node.
// (O arquivo só importa tipos, então basta transpilar, sem empacotar.)
const classificationPath = new URL("../../src/shared/classification.ts", import.meta.url).pathname;
const compiled = await transformWithEsbuild(readFileSync(classificationPath, "utf8"), classificationPath, {
  format: "esm", loader: "ts",
});
const { SUGGESTED_CLASSIFICATION } = await import(
  `data:text/javascript;base64,${Buffer.from(compiled.code).toString("base64")}`
);

const W = 1600;
const H = 900;
const SYLLABLES_BY_WORD = [
  ["Pu", "er"], ["na", "tus"], ["est"], ["no", "bis"], ["et"],
  ["fi", "li", "us"], ["da", "tus"], ["est"], ["no", "bis"],
];
const TOTAL = SYLLABLES_BY_WORD.flat().length;

/** Gerador pseudo-aleatório determinístico, para o SVG sair igual a cada execução. */
function rng(seed) {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296;
    return s / 4294967296;
  };
}

function pageSvg(seed) {
  const rand = rng(seed);
  const parts = [`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">`];
  parts.push(`<rect width="${W}" height="${H}" fill="#efe3c8"/>`);
  for (let band = 0; band < 4; band++) {
    const top = 120 + band * 200;
    for (let l = 0; l < 4; l++) {
      parts.push(`<line x1="40" x2="${W - 40}" y1="${top + l * 16}" y2="${top + l * 16}" stroke="#9a9a9a" stroke-width="1"/>`);
    }
    const slot = (W - 80) / TOTAL;
    for (let i = 0; i < TOTAL; i++) {
      const x = 40 + i * slot + slot * (0.2 + rand() * 0.2);
      const y = top - 18 - rand() * 14;
      parts.push(`<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${(10 + rand() * 22).toFixed(1)}" height="${(5 + rand() * 9).toFixed(1)}" fill="#2b2118"/>`);
      parts.push(`<rect x="${(x + 4).toFixed(1)}" y="${(y + 8).toFixed(1)}" width="5" height="${(14 + rand() * 18).toFixed(1)}" fill="#2b2118"/>`);
    }
  }
  parts.push("</svg>");
  return parts.join("");
}

function makeImage(seed) {
  const bytes = Buffer.from(pageSvg(seed), "utf8");
  const imageId = createHash("sha256").update(bytes).digest("hex");
  return {
    // O renderer ainda lê dataUrl inline (SessionProject); imageId acompanha como no main.
    ref: {
      imageId, width: W, height: H, mimeType: "image/svg+xml",
      dataUrl: `data:image/svg+xml;base64,${bytes.toString("base64")}`,
    },
    stored: { imageId, mimeType: "image/svg+xml", b64: bytes.toString("base64") },
  };
}

/** Caixas em metade das sílabas (as pares), para os estados com e sem recorte aparecerem. */
function boxes() {
  const out = {};
  for (let i = 0; i < TOTAL; i++) {
    out[i] = i % 2 === 0 ? { x: 0.025 + i * 0.059, y: 0.07, w: 0.05, h: 0.2 } : null;
  }
  return out;
}

const NO_ADJUST = {
  brightness: 100, contrast: 100, saturation: 100, grayscale: 0,
  invert: false, rotation: 0, flipH: false, flipV: false,
};

function source(order, siglum, library, city, century, classes, folio, image, confirmed) {
  return {
    id: `src-${order}`,
    order,
    metadata: { siglum, library, city, century, classes },
    lines: [{
      id: `line-${order}`,
      image,
      syllableRange: { start: 0, end: TOTAL - 1 },
      dividers: [],
      gaps: [],
      syllableBoxes: boxes(),
      folio,
      imageAdjustments: { ...NO_ADJUST },
      confirmed,
    }],
    syllableCuts: {},
  };
}

export function buildFixture() {
  const a = makeImage(11);
  const b = makeImage(29);
  const now = "2026-01-01T00:00:00.000Z";
  const project = {
    meta: { title: "Puer natus est", author: "", createdAt: now, updatedAt: now },
    text: {
      raw: "Puer natus est nobis et filius datus est nobis",
      words: SYLLABLES_BY_WORD.map((s) => ({ original: s.join(""), syllables: s })),
      hyphenationMode: "manual",
    },
    sections: [],
    classification: structuredClone(SUGGESTED_CLASSIFICATION),
    sources: [
      source(0, "Einsiedeln 121", "Stiftsbibliothek", "Einsiedeln", "X",
        ["tipo.adiastematica", "regiao.germanica", "familia.sao-galo"], "12r", a.ref, true),
      source(1, "Laon 239", "Bibliothèque municipale", "Laon", "X",
        ["tipo.adiastematica", "regiao.francesa", "familia.laon"], "5v", b.ref, false),
    ],
  };
  return { project, images: [a.stored, b.stored] };
}
