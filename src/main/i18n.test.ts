import { describe, it, expect, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { MAIN_LANGS, initMainI18n, resolveLanguage, setMainLanguage, t } from "./i18n";

const LOCALES_DIR = join(__dirname, "../renderer/i18n/locales");
const load = (lang: string): Record<string, string> =>
  JSON.parse(readFileSync(join(LOCALES_DIR, `${lang}.json`), "utf-8"));
const placeholders = (s: string) => [...s.matchAll(/\{\{(\w+)\}\}/g)].map((m) => m[1]).sort();

describe("main i18n", () => {
  beforeEach(() => initMainI18n("pt-BR"));

  it("translates in pt-BR by default and follows language changes", () => {
    expect(t("main.unsaved.save")).toBe("Salvar");
    setMainLanguage("en");
    expect(t("main.unsaved.save")).toBe("Save");
    setMainLanguage("de-DE");
    expect(t("main.unsaved.discard")).toBe("Nicht speichern");
  });

  it("resolves language variants and falls back to pt-BR", () => {
    expect(resolveLanguage("pt")).toBe("pt-BR");
    expect(resolveLanguage("pt-PT")).toBe("pt-BR");
    expect(resolveLanguage("ja-JP")).toBe("ja");
    expect(resolveLanguage("fr")).toBe("pt-BR");
    expect(resolveLanguage(undefined)).toBe("pt-BR");
  });

  it("interpolates without HTML escaping", () => {
    const msg = t("main.error.saveFailed", { path: "C:\\<tese>\\a.mocquereau", reason: "EACCES" });
    expect(msg).toContain("C:\\<tese>\\a.mocquereau");
    expect(msg).toContain("EACCES");
  });

  it("every locale has every main.* key of pt-BR, non-empty, with the same placeholders", () => {
    const base = load("pt-BR");
    const mainKeys = Object.keys(base).filter((k) => k.startsWith("main."));
    expect(mainKeys).toHaveLength(25);
    for (const lang of MAIN_LANGS) {
      const dict = load(lang);
      for (const key of mainKeys) {
        expect(dict[key], `${lang}:${key}`).toBeTruthy();
        expect(placeholders(dict[key]), `${lang}:${key}`).toEqual(placeholders(base[key]));
      }
    }
  });
});
