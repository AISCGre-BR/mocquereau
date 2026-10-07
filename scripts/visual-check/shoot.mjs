// Captura as telas do renderer com Playwright, sem Electron.
// Pré-requisito: o renderer precisa estar construído em out/renderer
// (`npm run build:renderer` ou `npx electron-vite build`; `npm run visual-check` já constrói).
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

const server = http.createServer((req, res) => {
  let file = path.join(ROOT, decodeURIComponent(req.url.split("?")[0]));
  if (!file.startsWith(ROOT) || !existsSync(file) || statSync(file).isDirectory()) file = path.join(ROOT, "index.html");
  res.writeHead(200, { "content-type": MIME[path.extname(file)] || "application/octet-stream" });
  res.end(readFileSync(file));
}).listen(0);
const port = server.address().port;

/** Substitui window.mocquereau (preload) por um stub com o projeto e as imagens da fixture. */
const stub = ({ theme, data }) => {
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
    getRecentFiles: async () => ["/fixture/Puer natus est.mocquereau", "/fixture/Gloria VIII.mocquereau"],
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

/** Telas: cada uma leva a página ao estado a capturar. Ctrl+1..4 trocam as vistas. */
const SCREENS = {
  welcome: async () => {},
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
for (const theme of THEMES) {
  for (const [w, h] of VIEWPORTS) {
    for (const [name, run] of Object.entries(SCREENS)) {
      // Contexto novo por captura: cada tela parte da tela inicial, sem estado de outra.
      const ctx = await browser.newContext({ viewport: { width: w, height: h }, colorScheme: theme });
      const page = await ctx.newPage();
      const label = `${theme}-${w}x${h}-${name}`;
      page.on("pageerror", (e) => { failed = true; console.error(`[${label}] pageerror: ${e.message}`); });
      page.on("console", (m) => { if (m.type() === "error") { failed = true; console.error(`[${label}] console.error: ${m.text()}`); } });
      await page.addInitScript(stub, { theme, data });
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
