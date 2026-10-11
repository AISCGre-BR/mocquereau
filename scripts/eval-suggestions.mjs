// scripts/eval-suggestions.mjs
//
// Suggestion evaluation over the user's own projects (passed as arguments; never
// copied into the repo). Builds cases from legacy .mocquereau.json files, rasterizes
// each page with the app's renderSuggestRaster in headless Chromium and runs the
// detector in Node, then prints one markdown table per source, scenario and mode.
// Scenarios: "frio" (page with no boxes) and "uma âncora" (the first ground-truth box of each
// area is already on the page, given to the detector as an anchor, and left out of the score).
// Score: IoU against the user's whole box (both notations).
//
// uso: node scripts/eval-suggestions.mjs <projeto>... [--modes sequential,candidates]
//        [--json <arquivo>] [--out <arquivo.md>] [--dump <dir>] [--othmar <arquivo.json>]
//        [--min-confidence 0.1,0.2]
import { build } from "esbuild";
import { chromium } from "playwright";
import { mkdtemp, readFile, writeFile, mkdir, rm } from "node:fs/promises";
import { realpathSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = realpathSync(path.resolve(HERE, ".."));

/** Real path of p, following symlinks of its nearest existing ancestor (p itself may not exist yet). */
function realTarget(p) {
  let cur = path.resolve(p);
  const rest = [];
  for (;;) {
    try {
      return path.join(realpathSync(cur), ...rest);
    } catch {
      const parent = path.dirname(cur);
      if (parent === cur) return path.resolve(p);
      rest.unshift(path.basename(cur));
      cur = parent;
    }
  }
}

function fail(msg, code = 2) {
  console.error(msg);
  process.exit(code);
}

function parseArgs(argv) {
  const opts = { projects: [], modes: ["sequential", "candidates"], json: null, out: null, dump: null, othmar: null, minConf: [undefined] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const val = () => {
      const v = argv[++i];
      if (v === undefined) fail(`${a}: falta o valor`);
      return v;
    };
    if (a === "--modes") opts.modes = val().split(",").map((s) => s.trim()).filter(Boolean);
    else if (a === "--json") opts.json = val();
    else if (a === "--out") opts.out = val();
    else if (a === "--dump") opts.dump = val();
    else if (a === "--othmar") opts.othmar = val();
    else if (a === "--min-confidence") opts.minConf = val().split(",").map(Number);
    else if (a.startsWith("--")) fail(`opção desconhecida: ${a}`);
    else opts.projects.push(a);
  }
  for (const m of opts.modes) if (m !== "sequential" && m !== "candidates") fail(`modo desconhecido: ${m}`);
  if (opts.minConf.some((v) => v !== undefined && !Number.isFinite(v))) fail("--min-confidence: números separados por vírgula");
  if (!opts.projects.length) fail("uso: node scripts/eval-suggestions.mjs <projeto>... [--modes sequential,candidates] [--json f] [--out f] [--dump dir] [--othmar f] [--min-confidence a,b]");
  for (const [flag, p] of [["--json", opts.json], ["--out", opts.out], ["--dump", opts.dump]]) {
    if (p === null) continue;
    const abs = realTarget(p);
    if (abs === REPO || abs.startsWith(REPO + path.sep)) fail(`${flag}: caminho dentro do repositório recusado (${abs}); os dados do usuário não entram no repo`);
  }
  return opts;
}

const opts = parseArgs(process.argv.slice(2));

// Read and check every input before allocating anything (bad input exits with nothing to clean up).
const inputs = [];
for (const projPath of opts.projects) {
  let json;
  try {
    json = JSON.parse((await readFile(projPath, "utf8")).replace(/^\uFEFF/, ""));
  } catch (err) {
    fail(`${projPath}: não foi possível ler o JSON (${err.message})`);
  }
  if (typeof json !== "object" || json === null || Array.isArray(json) || "schemaVersion" in json) {
    fail(`${projPath}: formato não suportado pelo eval (esperado .mocquereau.json legado)`);
  }
  inputs.push({ label: path.basename(projPath).replace(/\.mocquereau\.json$/, ""), json });
}
let othmar = null;
if (opts.othmar) {
  try {
    othmar = JSON.parse(await readFile(opts.othmar, "utf8"));
  } catch (err) {
    fail(`${opts.othmar}: não foi possível ler o JSON (${err.message})`);
  }
}

const fileSafe = (s) => s.replace(/[^\w.-]+/g, "_");
const rows = []; // { project, source, scenario, mode, minConf, ious[], wrong, ms[] }
/** Cenários: "frio" = página sem caixas; "uma âncora" = a primeira caixa de cada área já está na página. */
const SCENARIOS = ["frio", "uma âncora"];
const raw = { projects: [], skipped: [] };
const seenPages = []; // { c, name }: first occurrence of each page
const duplicates = [];

/** One row per source and mode; pages already seen elsewhere go to their row but not to "todas". */
function bucket(project, source, scenario, mode, minConf, dup) {
  let r = rows.find((x) => x.project === project && x.source === source && x.scenario === scenario && x.mode === mode && x.minConf === minConf);
  if (!r) rows.push((r = { project, source, scenario, mode, minConf, ious: [], wrong: 0, ms: [], uniq: { ious: [], wrong: 0, ms: [] }, dup: false }));
  r.dup ||= dup;
  return r;
}
/** ms null = no detector call (no plan): left out of the p95 sample. */
function add(b, dup, ious, wrong, ms) {
  for (const t of dup ? [b] : [b, b.uniq]) {
    t.ious.push(...ious);
    t.wrong += wrong;
    if (ms != null) t.ms.push(ms);
  }
}

// From here on every failure throws, so `finally` always closes Chromium and removes the temp dir.
let tmp = null;
let browser = null;
let E;
let failure = null;
try {
  // 1. Bundles (Node: cases/metrics/detector; browser: raster) in a temp dir.
  tmp = await mkdtemp(path.join(os.tmpdir(), "mocq-eval-"));
  const nodeBundle = path.join(tmp, "node.mjs");
  const pageBundle = path.join(tmp, "page.js");
  const alias = { "@shared": path.join(REPO, "src/shared") };
  await build({ entryPoints: [path.join(HERE, "eval/node.ts")], bundle: true, platform: "node", format: "esm", outfile: nodeBundle, alias, logLevel: "warning" });
  await build({ entryPoints: [path.join(HERE, "eval/page.ts")], bundle: true, platform: "browser", format: "iife", outfile: pageBundle, alias, logLevel: "error" });
  E = await import(pathToFileURL(nodeBundle).href);

  // 2. Headless Chromium with the raster helper.
  browser = await chromium.launch();
  const page = await browser.newPage();
  await page.addScriptTag({ path: pageBundle });
  if (opts.dump) await mkdir(opts.dump, { recursive: true });

  for (const { label, json } of inputs) {
    // The app's legacy-open ink realignment, with the app's decoder running in Chromium.
    const loadRaster = async (image) => {
      const r = await page.evaluate((u) => window.__evalInkRaster(u), image.dataUrl);
      if (!r) return null;
      const b = Buffer.from(r.b64, "base64");
      return { data: new Uint8ClampedArray(b.buffer, b.byteOffset, b.length), width: r.width, height: r.height };
    };
    const { cases, skipped } = await E.loadCases(json, label, { loadRaster });
    raw.skipped.push(...skipped);
    const projRaw = { project: label, cases: [] };
    raw.projects.push(projRaw);

    for (const c of cases) {
      const dupOf = seenPages.find((p) => E.samePage(p.c, c))?.name;
      if (dupOf) duplicates.push(`${label}: ${c.name} = ${dupOf} (mesma imagem e mesmas caixas; fora de "todas")`);
      else seenPages.push({ c, name: `${label}: ${c.name}` });
      const region = E.caseRegion(c);
      const r = await page.evaluate((a) => window.__evalRaster(a), {
        dataUrl: c.line.image.dataUrl,
        img: { width: c.line.image.width, height: c.line.image.height },
        frame: E.frameOf(c.line.imageAdjustments),
        region,
        png: !!opts.dump,
      });
      const buf = Buffer.from(r.b64, "base64");
      const raster = { data: new Uint8ClampedArray(buf.buffer, buf.byteOffset, buf.length), width: r.width, height: r.height };
      const caseRaw = { name: c.name, source: c.source, notation: c.notation, region, raster: { width: r.width, height: r.height }, gt: c.gt, areas: c.areas, firstGt: c.firstGt, modes: {} };
      projRaw.cases.push(caseRaw);

      for (const scenario of SCENARIOS) {
        const { anchors, scored } = scenario === "frio" ? { anchors: [], scored: c.gt } : E.oneAnchorScenario(c.gt, c.areas);
        const zones = scored.map((g) => g.zone);
        const key = (m) => (scenario === "frio" ? m : `${scenario}:${m}`);
        if (scenario !== "frio") caseRaw[`anchors:${scenario}`] = anchors.map((g) => g.index);
        if (opts.modes.includes("sequential")) {
          for (const mc of opts.minConf) {
            const { sugs, ms } = E.runSequential(c, raster, { minConfidence: mc, anchors });
            const ious = E.sequentialIous(sugs, scored);
            add(bucket(label, c.source, scenario, "sequential", mc, !!dupOf), !!dupOf, ious, E.wrongCount(sugs, scored), ms);
            caseRaw.modes[key(`sequential${mc === undefined ? "" : `@${mc}`}`)] = { ious, ms, suggestions: Object.fromEntries(sugs) };
          }
        }
        if (opts.modes.includes("candidates")) {
          const res = E.runCandidates(c, raster, anchors);
          const ious = E.candidateIous(res.cands, zones);
          add(bucket(label, c.source, scenario, "candidates", undefined, !!dupOf), !!dupOf, ious, 0, res.ms);
          caseRaw.modes[key("candidates")] = { ious, ms: res.ms, candidates: res.cands };
        }
      }
      if (othmar) {
        const boxes = othmar[c.name];
        if (Array.isArray(boxes)) {
          const cands = boxes.map(([x, y, w, h]) => E.regionToView({ x: x / r.width, y: y / r.height, w: w / r.width, h: h / r.height }, region));
          const ious = E.candidateIous(cands, c.gt.map((g) => g.zone));
          add(bucket(label, c.source, "frio", "Othmar", undefined, !!dupOf), !!dupOf, ious, 0, undefined);
          caseRaw.modes.othmar = { ious };
        }
      }
      if (opts.dump) {
        const base = path.join(opts.dump, fileSafe(`${label}__${c.name}`));
        await writeFile(`${base}.png`, Buffer.from(r.png, "base64"));
        const px = (z) => {
          const f = E.viewToRegion(z, region);
          return [f.x * r.width, f.y * r.height, f.w * r.width, f.h * r.height];
        };
        await writeFile(
          `${base}.json`,
          JSON.stringify({ case: c.name, project: label, notation: c.notation, width: r.width, height: r.height, zones: c.gt.map((g) => ({ index: g.index, zone: px(g.zone) })), areas: c.areas.map(px) }),
        );
      }
    }
  }
} catch (err) {
  failure = err;
} finally {
  await browser?.close().catch(() => {});
  if (tmp) await rm(tmp, { recursive: true, force: true });
}
if (failure) fail(`eval falhou: ${failure?.stack ?? failure}`);

// 4. Output.
const pct = (v) => `${Math.round(v * 100)}%`;
const dec = (v) => v.toFixed(2).replace(".", ",");
const modeName = (m, mc) => (mc === undefined ? m : `${m} (conf ≥ ${String(mc).replace(".", ",")})`);
function line(name, scenario, mode, ious, wrong, ms) {
  const s = E.summarize(ious);
  const msCol = ms.length ? String(Math.round(E.p95(ms))) : "-";
  const wrongCol = mode.startsWith("sequential") ? String(wrong) : "-";
  return `| ${name} | ${scenario} | ${mode} | ${s.n} | ${pct(s.found)} | ${pct(s.p50)} | ${pct(s.p70)} | ${dec(s.median)} | ${wrongCol} | ${msCol} |`;
}
const out = [
  "| fonte | cenário | modo | n | achados | IoU≥0,5 | IoU≥0,7 | IoU med | erradas | p95 ms |",
  "|---|---|---|---|---|---|---|---|---|---|",
];
const gkey = (r) => `${r.scenario}\u0000${r.mode}\u0000${r.minConf}`;
const groups = [...new Set(rows.map(gkey))];
for (const r of rows)
  out.push(line(`${r.source} (${r.project})${r.dup ? " [duplicata]" : ""}`, r.scenario, modeName(r.mode, r.minConf), r.ious, r.wrong, r.ms));
for (const g of groups) {
  const rs = rows.filter((r) => gkey(r) === g);
  const u = rs.map((r) => r.uniq);
  out.push(line("todas", rs[0].scenario, modeName(rs[0].mode, rs[0].minConf), u.flatMap((r) => r.ious), u.reduce((s, r) => s + r.wrong, 0), u.flatMap((r) => r.ms)));
}
const notes = [...raw.skipped.map((s) => `skipped: ${s}`), ...duplicates.map((d) => `duplicata: ${d}`)];
const table = [...out, ...(notes.length ? ["", ...notes] : [])].join("\n");
console.log(table);

if (opts.out) await writeFile(opts.out, table + "\n");
if (opts.json) {
  const summary = rows.map((r) => ({ project: r.project, source: r.source, scenario: r.scenario, mode: r.mode, minConfidence: r.minConf ?? null, duplicate: r.dup, ...E.summarize(r.ious), wrong: r.wrong, p95ms: E.p95(r.ms) }));
  await writeFile(opts.json, JSON.stringify({ summary, duplicates, ...raw }, null, 1));
}
