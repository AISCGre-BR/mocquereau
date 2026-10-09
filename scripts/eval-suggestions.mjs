// scripts/eval-suggestions.mjs
//
// Suggestion evaluation over the user's own projects (passed as arguments; never
// copied into the repo). Builds cases from legacy .mocquereau.json files, rasterizes
// each page with the app's renderSuggestRaster in headless Chromium and runs the
// detector in Node, then prints one markdown table per source and mode.
//
// uso: node scripts/eval-suggestions.mjs <projeto>... [--modes sequential,candidates]
//        [--json <arquivo>] [--out <arquivo.md>] [--dump <dir>] [--othmar <arquivo.json>]
//        [--min-confidence 0.1,0.2]
import { build } from "esbuild";
import { chromium } from "playwright";
import { mkdtemp, readFile, writeFile, mkdir, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, "..");

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
    const abs = path.resolve(p);
    if (abs === REPO || abs.startsWith(REPO + path.sep)) fail(`${flag}: caminho dentro do repositório recusado (${abs}); os dados do usuário não entram no repo`);
  }
  return opts;
}

const opts = parseArgs(process.argv.slice(2));

// 1. Bundles (Node: cases/metrics/detector; browser: raster) in a temp dir.
const tmp = await mkdtemp(path.join(os.tmpdir(), "mocq-eval-"));
const nodeBundle = path.join(tmp, "node.mjs");
const pageBundle = path.join(tmp, "page.js");
const alias = { "@shared": path.join(REPO, "src/shared") };
await build({ entryPoints: [path.join(HERE, "eval/node.ts")], bundle: true, platform: "node", format: "esm", outfile: nodeBundle, alias, logLevel: "warning" });
await build({ entryPoints: [path.join(HERE, "eval/page.ts")], bundle: true, platform: "browser", format: "iife", outfile: pageBundle, alias, logLevel: "error" });
const E = await import(pathToFileURL(nodeBundle).href);

// 2. Headless Chromium with the raster helper.
const browser = await chromium.launch();
const page = await browser.newPage();
await page.addScriptTag({ path: pageBundle });

const othmar = opts.othmar ? JSON.parse(await readFile(opts.othmar, "utf8")) : null;
if (opts.dump) await mkdir(opts.dump, { recursive: true });

const fileSafe = (s) => s.replace(/[^\w.-]+/g, "_");
const rows = []; // { project, source, mode, minConf, ious[], wrong, ms[] }
const raw = { projects: [], skipped: [] };
const unavailable = new Set();

function bucket(project, source, mode, minConf) {
  let r = rows.find((x) => x.project === project && x.source === source && x.mode === mode && x.minConf === minConf);
  if (!r) rows.push((r = { project, source, mode, minConf, ious: [], wrong: 0, ms: [] }));
  return r;
}

try {
  for (const projPath of opts.projects) {
    const label = path.basename(projPath).replace(/\.mocquereau\.json$/, "");
    let json;
    try {
      json = JSON.parse((await readFile(projPath, "utf8")).replace(/^﻿/, ""));
    } catch (err) {
      fail(`${projPath}: não foi possível ler o JSON (${err.message})`);
    }
    const { cases, skipped } = await E.loadCases(json, label);
    raw.skipped.push(...skipped);
    for (const s of skipped) console.error(`pulado: ${s}`);
    const projRaw = { project: label, cases: [] };
    raw.projects.push(projRaw);

    for (const c of cases) {
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
      const zones = c.gt.map((g) => g.zone);
      const caseRaw = { name: c.name, source: c.source, notation: c.notation, region, raster: { width: r.width, height: r.height }, gt: c.gt, areas: c.areas, firstGt: c.firstGt, modes: {} };
      projRaw.cases.push(caseRaw);

      if (opts.modes.includes("sequential")) {
        for (const mc of opts.minConf) {
          const { sugs, ms } = E.runSequential(c, raster, { minConfidence: mc });
          const ious = E.sequentialIous(sugs, c.gt);
          const b = bucket(label, c.source, "sequential", mc);
          b.ious.push(...ious);
          b.wrong += E.wrongCount(sugs, c.gt);
          b.ms.push(ms);
          caseRaw.modes[`sequential${mc === undefined ? "" : `@${mc}`}`] = { ious, ms, suggestions: Object.fromEntries(sugs) };
        }
      }
      if (opts.modes.includes("candidates")) {
        const res = E.runCandidates(c, raster);
        if (res === null) unavailable.add("candidates");
        else {
          const ious = E.candidateIous(res.cands, zones);
          const b = bucket(label, c.source, "candidates", undefined);
          b.ious.push(...ious);
          b.ms.push(res.ms);
          caseRaw.modes.candidates = { ious, ms: res.ms, candidates: res.cands };
        }
      }
      if (othmar) {
        const boxes = othmar[c.name];
        if (Array.isArray(boxes)) {
          const cands = boxes.map(([x, y, w, h]) => E.regionToView({ x: x / r.width, y: y / r.height, w: w / r.width, h: h / r.height }, region));
          const ious = E.candidateIous(cands, zones);
          bucket(label, c.source, "Othmar", undefined).ious.push(...ious);
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
} finally {
  await browser.close();
  await rm(tmp, { recursive: true, force: true });
}

// 4. Output.
const pct = (v) => `${Math.round(v * 100)}%`;
const dec = (v) => v.toFixed(2).replace(".", ",");
const modeName = (m, mc) => (mc === undefined ? m : `${m} (conf ≥ ${String(mc).replace(".", ",")})`);
function line(name, mode, ious, wrong, ms) {
  const s = E.summarize(ious);
  const msCol = ms.length ? String(Math.round(E.p95(ms))) : "-";
  const wrongCol = mode.startsWith("sequential") ? String(wrong) : "-";
  return `| ${name} | ${mode} | ${s.n} | ${pct(s.found)} | ${pct(s.p50)} | ${pct(s.p70)} | ${dec(s.median)} | ${wrongCol} | ${msCol} |`;
}
const out = ["| fonte | modo | n | achados | IoU≥0,5 | IoU≥0,7 | IoU med | erradas | p95 ms |", "|---|---|---|---|---|---|---|---|---|"];
const groups = [...new Set(rows.map((r) => `${r.mode}\u0000${r.minConf}`))];
for (const r of rows) out.push(line(`${r.source} (${r.project})`, modeName(r.mode, r.minConf), r.ious, r.wrong, r.ms));
for (const g of groups) {
  const rs = rows.filter((r) => `${r.mode}\u0000${r.minConf}` === g);
  out.push(line("todas", modeName(rs[0].mode, rs[0].minConf), rs.flatMap((r) => r.ious), rs.reduce((s, r) => s + r.wrong, 0), rs.flatMap((r) => r.ms)));
}
const table = out.join("\n");
console.log(table);
for (const m of unavailable) console.error(`modo ${m}: o detector ainda não expõe candidatos (ignorado)`);

if (opts.out) await writeFile(opts.out, table + "\n");
if (opts.json) {
  const summary = rows.map((r) => ({ project: r.project, source: r.source, mode: r.mode, minConfidence: r.minConf ?? null, ...E.summarize(r.ious), wrong: r.wrong, p95ms: E.p95(r.ms) }));
  await writeFile(opts.json, JSON.stringify({ summary, ...raw }, null, 1));
}
