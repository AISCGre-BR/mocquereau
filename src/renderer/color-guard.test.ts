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

function listTsx(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) return listTsx(full);
    return name.endsWith(".tsx") ? [full] : [];
  });
}

const files = listTsx(ROOT).map((f) => relative(ROOT, f).split(sep).join("/"));
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

  it("informa a linha", () => {
    expect(violations('a\n<div className="text-red-600" />')).toEqual(["2: text-red-600"]);
  });
});

describe("guarda de cores em src/renderer/**/*.tsx", () => {
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
