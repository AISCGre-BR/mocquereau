// src/main/i18n.ts
//
// i18next instance for main-process strings (native dialogs, error boxes).
// Same catalogs as the renderer (spec D12), keys under "main.*". Language is
// initialised from userPrefs.language and follows settings:set-language.
import i18next, { type i18n as I18nInstance } from "i18next";
import ptBR from "../renderer/i18n/locales/pt-BR.json";
import en from "../renderer/i18n/locales/en.json";
import it from "../renderer/i18n/locales/it.json";
import es from "../renderer/i18n/locales/es.json";
import de from "../renderer/i18n/locales/de.json";
import pl from "../renderer/i18n/locales/pl.json";
import ja from "../renderer/i18n/locales/ja.json";

export const MAIN_LANGS = ["pt-BR", "en", "it", "es", "de", "pl", "ja"] as const;

const resources = {
  "pt-BR": { translation: ptBR },
  en: { translation: en },
  it: { translation: it },
  es: { translation: es },
  de: { translation: de },
  pl: { translation: pl },
  ja: { translation: ja },
};

let instance: I18nInstance | null = null;

export function resolveLanguage(lang?: string | null): string {
  if (!lang) return "pt-BR";
  if ((MAIN_LANGS as readonly string[]).includes(lang)) return lang;
  const base = lang.split("-")[0].toLowerCase();
  if (base === "pt") return "pt-BR";
  return (MAIN_LANGS as readonly string[]).find((l) => l === base) ?? "pt-BR";
}

export function initMainI18n(lang?: string | null): void {
  const next = i18next.createInstance();
  void next.init({
    resources,
    lng: resolveLanguage(lang),
    fallbackLng: "pt-BR",
    keySeparator: false,
    nsSeparator: false,
    interpolation: { escapeValue: false },
    initAsync: false,
  });
  instance = next;
}

export function setMainLanguage(lang: string): void {
  if (!instance) {
    initMainI18n(lang);
    return;
  }
  void instance.changeLanguage(resolveLanguage(lang));
}

export function t(key: string, vars?: Record<string, string | number>): string {
  if (!instance) initMainI18n();
  return String(instance!.t(key, vars ?? {}));
}
