import { describe, it, expect } from "vitest";
import ptBR from "./locales/pt-BR.json";
import en from "./locales/en.json";
import it_ from "./locales/it.json";
import es from "./locales/es.json";
import de from "./locales/de.json";
import pl from "./locales/pl.json";
import ja from "./locales/ja.json";

type Catalog = Record<string, string>;

const catalogs: Record<string, Catalog> = { en, it: it_, es, de, pl, ja };
const all: Record<string, Catalog> = { "pt-BR": ptBR, ...catalogs };
const TRANSLATED = ["it", "es", "de", "pl", "ja"] as const;
type Translated = (typeof TRANSLATED)[number];

/**
 * Valores que podem (ou devem) ser iguais ao inglês. "*" = invariante em todos os
 * idiomas (símbolos, placeholders de exemplo, nomes próprios); senão, só nos idiomas
 * listados, onde a palavra é a mesma (cognato técnico, ex.: "Folio" em codicologia).
 * Tudo que não estiver aqui e for idêntico ao en.json é tradução esquecida.
 */
const SAME_AS_EN: Record<string, "*" | readonly Translated[]> = {
  "exportDialog.emptyAuthor": "*",
  "projectSetup.migration.changedWordItem": "*",
  "sourceList.centuryPlaceholder": "*",
  "sourceList.siglumPlaceholder": "*",
  "sourceList.moveUp": "*",
  "sourceList.moveDown": "*",
  "sourceModal.cantusId": "*",
  "sourceModal.iiifManifestPlaceholder": "*",
  "sourceModal.sourceUrlPlaceholder": "*",
  "imageMetadataModal.folio": ["it", "es", "de", "pl"],
  "lineSidebar.folio": ["it", "es", "de", "pl"],
  "tablePreview.folioTitle": ["it", "es", "de", "pl"],
  "sourceList.imageButton": ["it", "es"],
  "imageAdjustmentsPanel.color": ["es"],
  "projectSetup.mode.manual": ["es"],
  "sourceList.progressHeader": ["es"],
  "exportDialog.title": ["de"],
  "projectSetup.mode.modern": ["de"],
  "sourceModal.siglum": ["pl"],
  "sourceList.cityPlaceholder": ["ja"],
  "shell.menu.file": ["it"],
  "shell.view.texto": ["de"],
  "newProject.step.text": ["de"],
  "newProject.mode.modern.name": ["de"],
  "newProject.mode.manual.name": ["es"],
};

function allowed(key: string, lng: Translated): boolean {
  const rule = SAME_AS_EN[key];
  return rule === "*" || (Array.isArray(rule) && rule.includes(lng));
}

function placeholders(value: string): string[] {
  return (value.match(/\{\{\s*[\w.]+\s*\}\}/g) ?? []).map((p) => p.replace(/\s/g, "")).sort();
}

describe("catálogos i18n", () => {
  const reference = Object.keys(ptBR).sort();
  for (const [lng, catalog] of Object.entries(catalogs)) {
    it(`${lng} tem exatamente as chaves do pt-BR`, () => {
      expect(Object.keys(catalog).sort()).toEqual(reference);
    });
  }

  for (const lng of TRANSLATED) {
    it(`${lng} não tem valores copiados do inglês`, () => {
      const catalog = all[lng];
      const untranslated = Object.keys(en).filter(
        (key) => catalog[key] === (en as Catalog)[key] && !allowed(key, lng),
      );
      expect(untranslated).toEqual([]);
    });
  }

  for (const [lng, catalog] of Object.entries(all)) {
    it(`${lng} preserva os placeholders {{…}} do pt-BR`, () => {
      const mismatched = reference.filter(
        (key) => JSON.stringify(placeholders(catalog[key] ?? "")) !== JSON.stringify(placeholders((ptBR as Catalog)[key])),
      );
      expect(mismatched).toEqual([]);
    });
  }

  it("a lista de exceções não tem chaves inexistentes", () => {
    expect(Object.keys(SAME_AS_EN).filter((key) => !(key in en))).toEqual([]);
  });
});
