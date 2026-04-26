// src/renderer/components/LanguageSelector.tsx

import { useTranslation } from 'react-i18next';
import { LANG_META, SUPPORTED_LANGS, type SupportedLang } from '../i18n';

interface Props {
  className?: string;
}

export function LanguageSelector({ className = '' }: Props) {
  const { i18n, t } = useTranslation();
  const current = (SUPPORTED_LANGS as readonly string[]).includes(i18n.language)
    ? (i18n.language as SupportedLang)
    : 'pt-BR';
  return (
    <select
      value={current}
      onChange={(e) => { void i18n.changeLanguage(e.target.value); }}
      className={['text-xs border border-gray-300 rounded px-1 py-0.5 bg-white', className].join(' ')}
      aria-label={t('languageSelector.ariaLabel')}
      title={t('languageSelector.title')}
    >
      {SUPPORTED_LANGS.map((lang) => (
        <option key={lang} value={lang}>
          {LANG_META[lang].flag} {LANG_META[lang].label}
        </option>
      ))}
    </select>
  );
}
