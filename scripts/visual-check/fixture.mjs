// Fixture sintética para o visual-check: projeto v3 mínimo com três fontes e páginas
// geradas aqui (SVG). Nenhuma imagem real de manuscrito entra no repositório.
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { crc32, deflateSync } from "node:zlib";
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

// Geradores sinteticos do detector de neumas (mesma transpilacao: o arquivo so importa tipos).
const syntheticPath = new URL("../../src/renderer/lib/neume-detect/synthetic.ts", import.meta.url).pathname;
const syntheticCode = await transformWithEsbuild(readFileSync(syntheticPath, "utf8"), syntheticPath, {
  format: "esm", loader: "ts",
});
const { buildAdiastematicLine } = await import(
  `data:text/javascript;base64,${Buffer.from(syntheticCode.code).toString("base64")}`
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

/** PNG RGBA 8 bits mínimo (sem dependências) a partir de um raster { data, width, height }. */
function encodePng({ data, width, height }) {
  const chunk = (type, body) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(body.length);
    const tb = Buffer.concat([Buffer.from(type, "ascii"), body]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(tb));
    return Buffer.concat([len, tb, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bits por canal
  ihdr[9] = 6; // RGBA
  const raw = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (width * 4 + 1)] = 0; // filtro "none"
    Buffer.from(data.buffer, data.byteOffset + y * width * 4, width * 4).copy(raw, y * (width * 4 + 1) + 1);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr), chunk("IDAT", deflateSync(raw)), chunk("IEND", Buffer.alloc(0)),
  ]);
}

/**
 * Página com neumas sintéticos sobre uma linha de texto (o gerador dos testes do detector), para
 * as telas de sugestões: as páginas SVG acima são fólios sem texto, onde o detector não tem o que
 * alinhar às sílabas. Cobre as sílabas `first`..`first + n - 1` (palavras `words`).
 */
const NEUME_W = 1600;
const NEUME_H = 320;
function makeNeumeLineImage(words, first) {
  const line = buildAdiastematicLine({ width: NEUME_W, height: NEUME_H, words, u: 4, seed: 5, firstIndex: first });
  const bytes = encodePng(line.raster);
  const imageId = createHash("sha256").update(bytes).digest("hex");
  return {
    ref: {
      imageId, width: NEUME_W, height: NEUME_H, mimeType: "image/png",
      dataUrl: `data:image/png;base64,${bytes.toString("base64")}`,
    },
    stored: { imageId, mimeType: "image/png", b64: bytes.toString("base64") },
  };
}

/**
 * Caixas nas sílabas pares e "sem neuma" nas ímpares, para os estados com e sem
 * recorte aparecerem. A partir de `pendingFrom` as sílabas ficam sem nada
 * (pendentes), para a Tabela mostrar também o estilo da célula pendente.
 */
function boxes(pendingFrom = TOTAL) {
  const out = {};
  for (let i = 0; i < pendingFrom; i++) {
    out[i] = i % 2 === 0 ? { x: 0.025 + i * 0.059, y: 0.07, w: 0.05, h: 0.2 } : null;
  }
  return out;
}

const NO_ADJUST = {
  brightness: 100, contrast: 100, saturation: 100, grayscale: 0,
  invert: false, rotation: 0, flipH: false, flipV: false,
};

function source(order, siglum, library, city, century, classes, folio, image, confirmed, pendingFrom, extraLine) {
  const end = extraLine ? extraLine.syllableRange.start - 1 : TOTAL - 1;
  return {
    id: `src-${order}`,
    order,
    metadata: { siglum, library, city, century, classes },
    lines: [{
      id: `line-${order}`,
      image,
      syllableRange: { start: 0, end },
      dividers: [],
      gaps: [],
      syllableBoxes: boxes(Math.min(pendingFrom ?? TOTAL, end + 1)),
      folio,
      imageAdjustments: { ...NO_ADJUST },
      confirmed,
    }, ...(extraLine ? [extraLine] : [])],
    syllableCuts: {},
  };
}

/** Sílabas a partir de `first` (palavras inteiras), sem caixas, com uma linha de neumas marcada. */
function neumeLine(id, first, image, folio) {
  return {
    id,
    image,
    syllableRange: { start: first, end: TOTAL - 1 },
    dividers: [],
    gaps: [],
    syllableBoxes: {},
    folio,
    imageAdjustments: { ...NO_ADJUST },
    confirmed: false,
    // Faixa sobre os neumas (y ~22..128 px de 320), acima da linha de texto.
    neumeBands: [{ x: 0.025, y: 0.07, w: 0.95, h: 0.33 }],
  };
}

export function buildFixture() {
  const a = makeImage(11);
  const b = makeImage(29);
  const c = makeImage(47);
  // Laon 239: as sílabas pendentes (a partir de "da", palavra 6) ficam numa segunda página.
  const PENDING_WORD = 6;
  const first = SYLLABLES_BY_WORD.slice(0, PENDING_WORD).flat().length;
  const d = makeNeumeLineImage(SYLLABLES_BY_WORD.slice(PENDING_WORD), first);
  const now = "2026-01-01T00:00:00.000Z";
  const project = {
    meta: { title: "Puer natus est", author: "", createdAt: now, updatedAt: now },
    text: {
      raw: "Puer natus est nobis\net filius datus est nobis",
      words: SYLLABLES_BY_WORD.map((s) => ({ original: s.join(""), syllables: s })),
      hyphenationMode: "manual",
    },
    sections: [
      { id: "sec-1", name: "Intonação", wordRange: [0, 3] },
      { id: "sec-2", name: "Et filius", wordRange: [4, 8] },
    ],
    classification: structuredClone(SUGGESTED_CLASSIFICATION),
    sources: [
      source(0, "Einsiedeln 121", "Stiftsbibliothek", "Einsiedeln", "X",
        ["tipo.adiastematica", "regiao.germanica", "familia.sao-galo"], "12r", a.ref, true),
      source(1, "Laon 239", "Bibliothèque municipale", "Laon", "X",
        ["tipo.adiastematica", "regiao.francesa", "familia.laon"], "5v", b.ref, false, first,
        neumeLine("line-1-neumas", first, d.ref, "6r")),
      // Segundo valor de nível 1: a Tabela mostra duas linhas de grupo.
      source(2, "Graduale Novum", "", "Regensburg", "XXI",
        ["tipo.quadrada", null, null], "28", c.ref, true),
    ],
  };
  return { project, images: [a.stored, b.stored, c.stored, d.stored] };
}
