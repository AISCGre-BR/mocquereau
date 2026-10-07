import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { violations } from "./color-guard";

const ROOT = fileURLToPath(new URL(".", import.meta.url));

/**
 * Arquivos ainda não migrados para tokens. Cada tarefa de migração remove os seus;
 * a lista termina vazia. Um arquivo listado que já esteja limpo faz o teste falhar.
 */
const PENDING: string[] = [];

/** .ts e .tsx do renderer, sem os testes (que trazem exemplos de cores cruas). */
function listSources(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) return listSources(full);
    if (/\.test\.tsx?$/.test(name) || name.endsWith(".d.ts")) return [];
    return /\.tsx?$/.test(name) ? [full] : [];
  });
}

const files = listSources(ROOT).map((f) => relative(ROOT, f).split(sep).join("/"));
const read = (file: string) => readFileSync(join(ROOT, file), "utf-8");

describe("violations", () => {
  it("detecta utilitários de paleta, branco/preto, hex e rgb()", () => {
    expect(violations('<div className="bg-gray-50" />')).toHaveLength(1);
    expect(violations('<div className="hover:text-blue-600" />')).toHaveLength(1);
    expect(violations('<div className="outline outline-2 outline-blue-500" />')).toHaveLength(1);
    expect(violations('<div className="bg-white" />')).toHaveLength(1);
    expect(violations('<div className="bg-black/40" />')).toHaveLength(1);
    expect(violations("style={{ borderRight: '1px solid #e5e7eb' }}")).toHaveLength(1);
    expect(violations("{ bg: 'rgba(239, 68, 68, 0.15)' }")).toHaveLength(1);
  });

  it("aceita tokens, utilitários sem cor e entidades HTML", () => {
    expect(violations('<div className="bg-surface text-ink border-rule ring-focus bg-ink/20" />')).toEqual([]);
    expect(violations('<div className="border-l-2 ring-offset-1 text-[10px] text-sm bg-transparent" />')).toEqual([]);
    expect(violations("<span>&#9679;</span>")).toEqual([]);
    expect(violations("const x = 1; // antes era text-gray-400")).toEqual([]);
  });

  it("detecta cores com nome em style, fill/stroke e canvas, e oklch()/color-mix()", () => {
    expect(violations('<path fill="white" />')).toHaveLength(1);
    expect(violations("<circle stroke='black' />")).toHaveLength(1);
    expect(violations('style={{ color: "red" }}')).toHaveLength(1);
    expect(violations("style={{ backgroundColor: 'Gray' }}")).toHaveLength(1);
    expect(violations('ctx.fillStyle = "black";')).toHaveLength(1);
    expect(violations("const c = 'oklch(0.7 0.1 30)';")).toHaveLength(1);
    expect(violations("background: `color-mix(in oklab, var(--x), transparent)`")).toHaveLength(1);
  });

  it("aceita transparent/currentColor/none e textos que só contêm o nome", () => {
    expect(violations('<path fill="currentColor" stroke="none" />')).toEqual([]);
    expect(violations("style={{ background: 'transparent' }}")).toEqual([]);
    expect(violations("<p>white label</p>")).toEqual([]);
    expect(violations("const label = t('shell.theme.dark');")).toEqual([]);
  });

  it("'//' dentro de string (URL) não esconde o resto da linha; comentário de verdade sim", () => {
    expect(violations('const u = "https://example.org"; const c = "#ff0000";')).toEqual(["1: #ff0000"]);
    expect(violations("open('http://x'); <div className=\"bg-white\" />")).toHaveLength(1);
    expect(violations("const x = 1; /* era #fff */ const y = 2;")).toEqual([]);
    expect(violations("const x = 1; // era bg-white")).toEqual([]);
  });

  it("informa a linha", () => {
    expect(violations('a\n<div className="text-red-600" />')).toEqual(["2: text-red-600"]);
  });
});

describe("guarda de cores em src/renderer/**/*.{ts,tsx}", () => {
  it("PENDING só lista arquivos que existem", () => {
    for (const p of PENDING) expect(files).toContain(p);
  });

  for (const file of files) {
    if (PENDING.includes(file)) {
      it(`${file} ainda está pendente (remova de PENDING quando migrar)`, () => {
        expect(violations(read(file)).length).toBeGreaterThan(0);
      });
    } else {
      it(`${file} usa só tokens do Parchment`, () => {
        expect(violations(read(file))).toEqual([]);
      });
    }
  }
});
