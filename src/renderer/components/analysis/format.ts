// src/renderer/components/analysis/format.ts
//
// Number formatting of the Análise view, in the app language.
import { useMemo } from "react";
import { useTranslation } from "react-i18next";

export interface AnalysisFormat {
  /** Fraction 0..1 as a whole percent ("67%"); empty for null. */
  percent: (x: number | null) => string;
  /** Mean with up to two decimals; empty for null. */
  mean: (x: number | null) => string;
}

export function useAnalysisFormat(): AnalysisFormat {
  const { i18n } = useTranslation();
  const lang = i18n.language;
  return useMemo(() => {
    const pct = new Intl.NumberFormat(lang, { style: "percent", maximumFractionDigits: 0 });
    const dec = new Intl.NumberFormat(lang, { minimumFractionDigits: 1, maximumFractionDigits: 2 });
    return {
      percent: (x) => (x === null ? "" : pct.format(x)),
      mean: (x) => (x === null ? "" : dec.format(x)),
    };
  }, [lang]);
}

/** Global syllable index -> syllable text. */
export function syllableTexts(words: { syllables: string[] }[]): string[] {
  return words.flatMap((w) => w.syllables);
}
