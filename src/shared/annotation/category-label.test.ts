import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { categoryLabel, createDefaultVocabulary, DEFAULT_CATEGORY_KEYS, DEFAULT_CATEGORY_NAMES } from "./default-vocabulary";
import { readVocabulary } from "../validate";

const t = (k: string) => `T(${k})`;

describe("categoryLabel", () => {
  it("custom name wins; default id follows the translation; unknown id falls back to the id", () => {
    expect(categoryLabel({ id: "cat.simple", name: "Elementares" }, t)).toBe("Elementares");
    expect(categoryLabel({ id: "cat.simple" }, t)).toBe("T(annotation.category.simple)");
    expect(categoryLabel({ id: "cat.liquescent" }, t)).toBe("T(annotation.category.liquescent)");
    expect(categoryLabel({ id: "cat.xyz" }, t)).toBe("cat.xyz");
  });
  it("the default vocabulary bakes no category name", () => {
    expect(createDefaultVocabulary(t).categories).toEqual([{ id: "cat.simple" }, { id: "cat.compound" }, { id: "cat.ornamental" }]);
  });
});

describe("DEFAULT_CATEGORY_NAMES", () => {
  it("matches the locale files", () => {
    for (const lang of ["pt-BR", "en", "it", "es", "de", "pl", "ja"]) {
      const cat = JSON.parse(readFileSync(resolve(__dirname, `../../renderer/i18n/locales/${lang}.json`), "utf8"));
      for (const [id, key] of Object.entries(DEFAULT_CATEGORY_KEYS)) {
        expect(DEFAULT_CATEGORY_NAMES[id]).toContain(cat[key]);
      }
    }
  });
});

describe("load-time normalization", () => {
  it("drops a baked default name of any locale, keeps a custom one", () => {
    const ctx = { warnings: [] as string[], errors: [] as string[] };
    const v = readVocabulary(
      {
        categories: [
          { id: "cat.simple", name: "Simple" },
          { id: "cat.compound", name: "Zusammengesetzte" },
          { id: "cat.liquescent", name: "Liquescentes" },
          { id: "cat.ornamental", name: "Meus ornamentos" },
          { id: "cat.custom", name: "Simples" },
        ],
        kinds: [],
        letters: [],
      },
      ctx,
    )!;
    expect(v.categories).toEqual([
      { id: "cat.simple" }, { id: "cat.compound" }, { id: "cat.liquescent" },
      { id: "cat.ornamental", name: "Meus ornamentos" }, { id: "cat.custom", name: "Simples" },
    ]);
    expect(ctx.warnings).toEqual([]);
  });
});
