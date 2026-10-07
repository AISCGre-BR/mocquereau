// Gera resources/examples/dominus-dixit.mocquereau a partir das imagens em
// resources/examples/src/*.jpg (e-codices, CC BY-NC 4.0; ver resources/examples/README.md).
// Usa o mesmo escritor de pacote do app (saveDocument) e a mesma silabificação do renderer:
// o código TypeScript é empacotado em memória com esbuild (o que o Vite já traz).
//
// Uso: node scripts/build-example.mjs
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { build } from "esbuild";

const root = fileURLToPath(new URL("..", import.meta.url));
const work = mkdtempSync(join(tmpdir(), "mocquereau-example-"));
const bundle = join(work, "entry.mjs");

try {
  await build({
    stdin: {
      contents: `
        export { saveDocument } from "./src/main/document-io";
        export { SessionStore } from "./src/main/session-store";
        export { syllabifyText } from "./src/renderer/lib/syllabify";
        export { SUGGESTED_CLASSIFICATION, cloneClassification } from "./src/shared/classification";
      `,
      resolveDir: root,
      loader: "ts",
    },
    bundle: true,
    platform: "node",
    format: "esm",
    outfile: bundle,
    alias: { "@shared": join(root, "src/shared") },
    external: ["yazl", "yauzl"],
    logLevel: "warning",
  });
  // yazl/yauzl são resolvidos a partir do projeto, não da pasta temporária.
  const code = readFileSync(bundle, "utf8");
  const local = join(root, "scripts", ".build-example.tmp.mjs");
  writeFileSync(local, code);
  let mod;
  try {
    mod = await import(pathToFileURL(local).href);
  } finally {
    rmSync(local, { force: true });
  }
  await run(mod);
} finally {
  rmSync(work, { recursive: true, force: true });
}

/** Largura e altura de um JPEG lendo o marcador SOF. */
function jpegSize(bytes) {
  let i = 2;
  while (i < bytes.length) {
    if (bytes[i] !== 0xff) { i++; continue; }
    const marker = bytes[i + 1];
    const len = bytes.readUInt16BE(i + 2);
    if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
      return { height: bytes.readUInt16BE(i + 5), width: bytes.readUInt16BE(i + 7) };
    }
    i += 2 + len;
  }
  throw new Error("JPEG sem marcador SOF");
}

async function run({ saveDocument, SessionStore, syllabifyText, cloneClassification, SUGGESTED_CLASSIFICATION }) {
  const text = "Dominus dixit ad me: Filius meus es tu, ego hodie genui te.";
  const words = syllabifyText(text, "sung");
  const total = words.reduce((n, w) => n + w.syllables.length, 0);

  const image = (name) => {
    const bytes = readFileSync(join(root, "resources/examples/src", name));
    const { width, height } = jpegSize(bytes);
    return { dataUrl: `data:image/jpeg;base64,${bytes.toString("base64")}`, width, height, mimeType: "image/jpeg" };
  };
  const noAdjust = {
    brightness: 100, contrast: 100, saturation: 100, grayscale: 0,
    invert: false, rotation: 0, flipH: false, flipV: false,
  };
  const source = (order, siglum, city, sourceUrl, folio, file) => ({
    id: `src-${order}`,
    order,
    metadata: {
      siglum,
      library: `Stiftsbibliothek ${city} · e-codices (CC BY-NC 4.0)`,
      city,
      century: "X",
      sourceUrl,
      classes: ["tipo.adiastematica", "regiao.germanica", "familia.sao-galo"],
    },
    lines: [{
      id: `line-${order}`,
      image: image(file),
      syllableRange: { start: 0, end: total - 1 },
      dividers: [],
      gaps: [],
      syllableBoxes: {},
      folio,
      imageAdjustments: { ...noAdjust },
      confirmed: false,
    }],
    syllableCuts: {},
  });

  const now = "2026-10-07T00:00:00.000Z";
  const project = {
    meta: { title: "Dominus dixit ad me", author: "", createdAt: now, updatedAt: now },
    text: { raw: text, words, hyphenationMode: "sung" },
    sections: [],
    classification: cloneClassification(SUGGESTED_CLASSIFICATION),
    sources: [
      source(0, "SG 339", "St. Gallen", "https://www.e-codices.unifr.ch/en/csg/0339/42", "p. 42", "sg339.jpg"),
      source(1, "E 121", "Einsiedeln", "https://www.e-codices.unifr.ch/en/sbe/0121/24", "p. 24", "e121.jpg"),
    ],
  };

  const { version } = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
  const store = await SessionStore.create(join(work, "sessions"));
  const target = join(root, "resources/examples/dominus-dixit.mocquereau");
  await saveDocument(project, target, store, version);
  console.log(`${target}: ${words.length} palavras, ${total} sílabas`);
}
