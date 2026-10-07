// Differences between syllabification modes, used to let the user compare
// and choose a mode, and to flag words whose sung and typographic splits disagree.
import { syllabifyText, type HyphenationMode } from "./syllabify";
import { wordLines } from "./word-lines";

export type SampleMode = Exclude<HyphenationMode, "manual">;

export interface SampleWord {
  syllables: string[];
  differs: boolean;
}

export interface Ambiguity {
  sung: string[];
  typographic: string[];
}

const SAMPLE_MODES: SampleMode[] = ["sung", "liturgical-typographic", "classical", "modern"];
const FALLBACK_WORDS = 12;

const same = (a: string[], b: string[]): boolean => a.join("-") === b.join("-");

export function modeSample(raw: string): Record<SampleMode, SampleWord[]> {
  const byMode = {} as Record<SampleMode, string[][]>;
  for (const mode of SAMPLE_MODES) {
    byMode[mode] = syllabifyText(raw, mode).map((w) => w.syllables);
  }
  const sung = byMode.sung;
  const differsAt = (i: number): boolean =>
    SAMPLE_MODES.some((m) => m !== "sung" && !same(byMode[m][i] ?? [], sung[i] ?? []));

  const lines = wordLines(raw, sung.length);
  const picked =
    lines.find((idx) => idx.some(differsAt)) ??
    Array.from({ length: Math.min(FALLBACK_WORDS, sung.length) }, (_, i) => i);

  const out = {} as Record<SampleMode, SampleWord[]>;
  for (const mode of SAMPLE_MODES) {
    out[mode] = picked.map((i) => ({
      syllables: byMode[mode][i],
      differs: mode !== "sung" && !same(byMode[mode][i], sung[i]),
    }));
  }
  return out;
}

export function ambiguousWords(raw: string): Map<number, Ambiguity> {
  const sung = syllabifyText(raw, "sung");
  const typographic = syllabifyText(raw, "liturgical-typographic");
  const result = new Map<number, Ambiguity>();
  sung.forEach((w, i) => {
    const t = typographic[i];
    if (t && !same(w.syllables, t.syllables)) {
      result.set(i, { sung: w.syllables, typographic: t.syllables });
    }
  });
  return result;
}
