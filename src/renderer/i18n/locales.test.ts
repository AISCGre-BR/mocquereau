import { describe, it, expect } from "vitest";
import ptBR from "./locales/pt-BR.json";
import en from "./locales/en.json";
import it_ from "./locales/it.json";
import es from "./locales/es.json";
import de from "./locales/de.json";
import pl from "./locales/pl.json";
import ja from "./locales/ja.json";

const catalogs: Record<string, Record<string, string>> = { en, it: it_, es, de, pl, ja };

describe("catálogos i18n", () => {
  const reference = Object.keys(ptBR).sort();
  for (const [lng, catalog] of Object.entries(catalogs)) {
    it(`${lng} tem exatamente as chaves do pt-BR`, () => {
      expect(Object.keys(catalog).sort()).toEqual(reference);
    });
  }
});
