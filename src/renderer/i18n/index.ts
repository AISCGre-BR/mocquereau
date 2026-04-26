// src/renderer/i18n/index.ts
//
// Configuração do i18next para o renderer. Idiomas suportados: pt-BR (canônico),
// EN, IT, ES, DE, PL, JA. Persistência via electron-conf no main (IPC já existe
// em MocquereauAPI: window.mocquereau.getLanguage / setLanguage). Detecção do
// idioma do SO no primeiro launch via languagedetector + fallback pt-BR.

import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';

import ptBR from './locales/pt-BR.json';
import en from './locales/en.json';
import it from './locales/it.json';
import es from './locales/es.json';
import de from './locales/de.json';
import pl from './locales/pl.json';
import ja from './locales/ja.json';

export const SUPPORTED_LANGS = ['pt-BR', 'en', 'it', 'es', 'de', 'pl', 'ja'] as const;
export type SupportedLang = typeof SUPPORTED_LANGS[number];

export const LANG_META: Record<SupportedLang, { label: string; flag: string }> = {
  'pt-BR': { label: 'Português', flag: '🇧🇷' },
  en:      { label: 'English',   flag: '🇺🇸' },
  it:      { label: 'Italiano',  flag: '🇮🇹' },
  es:      { label: 'Español',   flag: '🇪🇸' },
  de:      { label: 'Deutsch',   flag: '🇩🇪' },
  pl:      { label: 'Polski',    flag: '🇵🇱' },
  ja:      { label: '日本語',     flag: '🇯🇵' },
};

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    // Aliases para todas as variantes que o detector pode retornar para PT
    // (`pt`, `pt-BR`, `pt-br`, `pt-PT`). Catalog é o mesmo. Sem isso o i18next
    // pode normalizar pt-BR → pt e não achar o resource.
    resources: {
      'pt-BR': { translation: ptBR },
      'pt-br': { translation: ptBR },
      'pt-PT': { translation: ptBR },
      pt:      { translation: ptBR },
      en:      { translation: en },
      'en-US': { translation: en },
      'en-GB': { translation: en },
      it:      { translation: it },
      'it-IT': { translation: it },
      es:      { translation: es },
      'es-ES': { translation: es },
      de:      { translation: de },
      'de-DE': { translation: de },
      pl:      { translation: pl },
      'pl-PL': { translation: pl },
      ja:      { translation: ja },
      'ja-JP': { translation: ja },
    },
    lng: 'pt-BR',
    fallbackLng: 'pt-BR',
    supportedLngs: false,
    // Catalog é flat com chaves literais ("foo.bar"); desligar separadores.
    keySeparator: false,
    nsSeparator: false,
    interpolation: { escapeValue: false },
    detection: {
      order: ['navigator'],
      caches: [],
    },
    react: {
      useSuspense: false,
    },
  });

// Hidrata do electron-conf no boot e persiste em mudanças.
async function syncWithElectronConf(): Promise<void> {
  try {
    const stored = await window.mocquereau?.getLanguage?.();
    if (stored && SUPPORTED_LANGS.includes(stored as SupportedLang)) {
      await i18n.changeLanguage(stored);
    }
  } catch { /* main não disponível em testes */ }
  i18n.on('languageChanged', (lng) => {
    window.mocquereau?.setLanguage?.(lng).catch(() => undefined);
  });
}
void syncWithElectronConf();

export default i18n;
