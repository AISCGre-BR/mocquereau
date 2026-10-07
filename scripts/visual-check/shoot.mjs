// Captura as telas do renderer com Playwright, sem Electron.
// Pré-requisito: o renderer precisa estar construído em out/renderer
// (`npx electron-vite build` ou `npm run build`; `npm run visual-check` já constrói).
// Saída: scripts/visual-check/out/<tema>-<largura>x<altura>-<tela>.png
// VISUAL_PROJECT=/caminho/projeto.json troca a fixture ({ project, images[] } com bytes em base64).
import { chromium } from "playwright";
import http from "node:http";
import { readFileSync, existsSync, statSync, mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildFixture } from "./fixture.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "../../out/renderer");
const OUT = path.join(HERE, "out");
const THEMES = ["light", "dark"];
const VIEWPORTS = [[1440, 900], [1280, 720]];
const MIME = {
  ".html": "text/html", ".js": "text/javascript", ".css": "text/css",
  ".woff2": "font/woff2", ".svg": "image/svg+xml", ".png": "image/png",
};

if (!existsSync(path.join(ROOT, "index.html"))) {
  console.error("out/renderer não existe: construa antes com `npx electron-vite build`.");
  process.exit(1);
}
mkdirSync(OUT, { recursive: true });

const data = process.env.VISUAL_PROJECT
  ? JSON.parse(readFileSync(process.env.VISUAL_PROJECT, "utf8"))
  : buildFixture();

/**
 * O Chromium pinta de forma incompleta um SVG ampliado e recortado em <img> (a tabela mostra
 * células em branco que o app não tem), e manuscritos reais são rasters. Por isso as páginas
 * SVG da fixture viram PNG aqui, antes das capturas.
 */
async function rasterizeSvgs(browser, data) {
  const page = await browser.newPage();
  for (const im of data.images.filter((i) => i.mimeType === "image/svg+xml")) {
    const ref = data.project.sources.flatMap((s) => s.lines).find((l) => l.image.imageId === im.imageId)?.image;
    await page.setViewportSize({ width: ref?.width ?? 1600, height: ref?.height ?? 900 });
    await page.setContent(`<body style="margin:0"><img src="data:image/svg+xml;base64,${im.b64}"></body>`);
    const png = (await page.screenshot()).toString("base64");
    im.b64 = png;
    im.mimeType = "image/png";
    for (const line of data.project.sources.flatMap((s) => s.lines)) {
      if (line.image.imageId === im.imageId) {
        line.image.mimeType = "image/png";
        line.image.dataUrl = `data:image/png;base64,${png}`;
      }
    }
  }
  await page.close();
}

const server = http.createServer((req, res) => {
  let file = path.join(ROOT, decodeURIComponent(req.url.split("?")[0]));
  if (!file.startsWith(ROOT + path.sep) || !existsSync(file) || statSync(file).isDirectory()) file = path.join(ROOT, "index.html");
  res.writeHead(200, { "content-type": MIME[path.extname(file)] || "application/octet-stream" });
  res.end(readFileSync(file));
}).listen(0, "127.0.0.1");
await new Promise((resolve) => server.once("listening", resolve));
const port = server.address().port;

/** Substitui window.mocquereau (preload) por um stub com o projeto e as imagens da fixture. */
const stub = ({ theme, data, emptyRecent }) => {
  const toBuffer = (b64) => Uint8Array.from(atob(b64), (c) => c.charCodeAt(0)).buffer;
  const images = new Map(data.images.map((i) => [i.imageId, i]));
  const opened = () => ({ project: data.project, filePath: "/fixture/Puer natus est.mocquereau" });
  window.mocquereau = {
    platform: "linux",
    saveProject: async () => ({ filePath: "/fixture/Puer natus est.mocquereau" }),
    saveProjectAs: async () => ({ filePath: "/fixture/Puer natus est.mocquereau" }),
    setDirty: async () => {},
    onSaveRequested: () => () => {},
    openProjectByPath: async () => opened(),
    getRecent: async () => {
      if (emptyRecent) return [];
      const im = data.images[0];
      const thumb = im ? `data:${im.mimeType};base64,${im.b64}` : undefined;
      const meta = (title, updatedAt, withThumb) => ({
        title, author: "André Gaby", updatedAt, thumb: withThumb ? thumb : undefined,
        sources: data.project.sources.map((s, i) => ({ siglum: s.metadata?.siglum || `Fonte ${i + 1}`, progress: [0.96, 0.14, 0.5][i % 3] })),
      });
      return [
        { path: "/fixture/Puer natus est.mocquereau", meta: meta("Puer natus est", "2026-04-27T12:00:00.000Z", true) },
        { path: "/fixture/Dominus dixit ad me.mocquereau", meta: meta("Dominus dixit ad me", "2026-04-15T12:00:00.000Z", true) },
        { path: "/fixture/Sanctus VIII.mocquereau", meta: meta("Sanctus VIII", "2026-04-20T12:00:00.000Z", false) },
        { path: "/fixture/Resurrexi.mocquereau" },
        ...["Gloria VIII", "Kyrie XI", "Credo III", "Agnus Dei", "Alleluia"].map((n, i) => ({
          path: `/fixture/${n}.mocquereau`,
          meta: meta(n, `2026-03-${10 + i}T12:00:00.000Z`, i % 2 === 0),
        })),
      ];
    },
    updateRecentMeta: async () => {},
    addRecentFile: async () => {},
    clearRecentFiles: async () => {},
    getTutorialSeen: async () => true,
    setTutorialSeen: async () => {},
    getAppVersion: async () => "0.0.0-visual",
    openProject: async () => opened(),
    importGueranger: async () => null,
    exportDocx: async () => ({ filePath: "/fixture/saida.docx" }),
    putImage: async () => { throw new Error("visual-check: putImage não suportado"); },
    getImages: async (ids) =>
      ids.filter((id) => images.has(id)).map((id) => ({
        imageId: id, mimeType: images.get(id).mimeType, bytes: toBuffer(images.get(id).b64),
      })),
    fetchIiifImage: async () => null,
    readClipboardImage: async () => null,
    openImageFile: async () => null,
    openExternal: async () => {},
    getLanguage: async () => "pt-BR",
    setLanguage: async (l) => l,
    getClassification: async () => data.project.classification,
    setClassification: async () => {},
    getTheme: async () => theme,
    setTheme: async () => true,
  };
};

const settle = (page, ms = 1200) => page.waitForTimeout(ms);

async function openFixtureProject(page) {
  await page.keyboard.press("Control+o");
  await settle(page, 3000);
}

const GUIDE_TEXT = [
  "Glória in excélsis Deo",
  "Et in terra pax homínibus bonae voluntátis",
  "Laudámus te",
  "Benedícimus te",
  "Adorámus te",
  "Glorificámus te",
  "Grátias ágimus tibi propter magnam glóriam tuam",
  "Dómine Deus, Rex caeléstis Deus Pater omnípotens",
].join("\n");

/** Abre o guia de criação e avança até o passo `upTo` (1 = Peça … 4 = Conferir). */
async function openGuide(page, upTo) {
  await page.keyboard.press("Control+n");
  await settle(page, 400);
  if (upTo === 1) return;
  await page.getByPlaceholder("Título da peça").fill("Gloria VIII");
  await page.getByPlaceholder("Autor").fill("André Gaby");
  await page.getByRole("button", { name: "Continuar" }).click();
  await page.getByPlaceholder("Cole ou digite o texto litúrgico").fill(GUIDE_TEXT);
  if (upTo === 2) return settle(page, 400);
  await page.getByRole("button", { name: "Continuar" }).click();
  if (upTo === 3) return settle(page, 400);
  await page.getByRole("button", { name: "Continuar" }).click();
  await page.getByTestId("word-22").click({ position: { x: 2, y: 12 } });
  await settle(page, 400);
}

/** Telas: cada uma leva a página ao estado a capturar. Ctrl+1..4 trocam as vistas. */
const SCREENS = {
  welcome: async () => {},
  "welcome-empty": async () => {},
  "novo-peca": async (page) => { await openGuide(page, 1); },
  "novo-texto": async (page) => { await openGuide(page, 2); },
  "novo-divisao": async (page) => { await openGuide(page, 3); },
  "novo-conferir": async (page) => { await openGuide(page, 4); },
  texto: async (page) => { await openFixtureProject(page); },
  fontes: async (page) => { await openFixtureProject(page); await page.keyboard.press("Control+2"); await settle(page); },
  recortes: async (page) => {
    await openFixtureProject(page);
    await page.keyboard.press("Control+3");
    await settle(page);
    await page.getByText("Confirmada").first().click();
    await settle(page, 3000);
  },
  tabela: async (page) => { await openFixtureProject(page); await page.keyboard.press("Control+4"); await settle(page, 5000); },
};

let failed = false;
const browser = await chromium.launch();
await rasterizeSvgs(browser, data);
for (const theme of THEMES) {
  for (const [w, h] of VIEWPORTS) {
    for (const [name, run] of Object.entries(SCREENS)) {
      // Contexto novo por captura: cada tela parte da tela inicial, sem estado de outra.
      const ctx = await browser.newContext({ viewport: { width: w, height: h }, colorScheme: theme });
      const page = await ctx.newPage();
      const label = `${theme}-${w}x${h}-${name}`;
      page.on("pageerror", (e) => { failed = true; console.error(`[${label}] pageerror: ${e.message}`); });
      page.on("console", (m) => { if (m.type() === "error") { failed = true; console.error(`[${label}] console.error: ${m.text()}`); } });
      await page.addInitScript(stub, { theme, data, emptyRecent: name === "welcome-empty" });
      await page.goto(`http://localhost:${port}/index.html`);
      await settle(page, 800);
      await run(page);
      await page.screenshot({ path: path.join(OUT, `${label}.png`) });
      await ctx.close();
    }
  }
}
await browser.close();
server.close();
console.log(`Capturas em ${path.relative(process.cwd(), OUT)}`);
if (failed) process.exit(1);
