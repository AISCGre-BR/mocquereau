// src/renderer/lib/syllabify.ts
// Syllabification engine for all five Latin hyphenation modes.
//
// Sung mode (default, SYLL-06 / D-02): Hypher with bundled gregorio-project
//   patterns (la-liturgical.ts) + Clayton Dias post-processor + override dict.
// Liturgical-typographic mode: Hypher only (previous 'liturgical' behavior).
// Classical/Modern modes: `hyphen` npm package (Strategy B per RESEARCH.md).
// Manual mode: parses user-typed hyphens directly — no Hypher involved.

import Hypher from 'hypher';
import liturgicalPatterns from './patterns/la-liturgical';
import { hyphenateSync as classicalHyphenate } from './patterns/la-classical';
import { hyphenateSync as modernHyphenate } from './patterns/la-modern';
import type { SyllabifiedWord } from './models';
import { applySungRules } from './syllabify-sung-rules';
import { liturgicalOverrides, normalizeOverrideKey } from './syllabify-overrides';

// SYLL-06 / D-02: 'liturgical' was renamed. 'sung' (new default) runs the
// Hypher+hyphen-la output through a Clayton-Dias-aligned post-processor;
// 'liturgical-typographic' preserves the pre-SYLL-06 Hypher-only behavior.
export type HyphenationMode =
  | 'sung'
  | 'liturgical-typographic'
  | 'classical'
  | 'modern'
  | 'manual';

// Instantiate the Hypher engine once at module load (not per call).
const liturgicalEngine = new Hypher(liturgicalPatterns);

/** Normalize Latin ligatures so Hypher patterns match (æ→ae, œ→oe). */
function normalizeLigatures(word: string): string {
  return word
    .replace(/æ/g, 'ae')
    .replace(/œ/g, 'oe')
    .replace(/Æ/g, 'Ae')
    .replace(/Œ/g, 'Oe');
}

/**
 * Split a single word using the hyphen package's hyphenateSync.
 * hyphenateSync returns a string with soft-hyphen characters (U+00AD) at
 * break points. We split on those to get syllables.
 */
function splitWithHyphen(
  word: string,
  fn: (w: string, opts: { hyphenChar: string }) => string
): string[] {
  const HYPHEN_CHAR = '\u00AD'; // soft hyphen
  const result = fn(word, { hyphenChar: HYPHEN_CHAR });
  const parts = result.split(HYPHEN_CHAR).filter(Boolean);
  // If the function returned no splits, return the word as a single syllable.
  return parts.length > 0 ? parts : [word];
}

/**
 * Syllabify a raw Latin text string for the given mode.
 *
 * - liturgical: Hypher with gregorio-project bundled patterns
 * - classical: `hyphen/la-x-classic` package
 * - modern: `hyphen/la` package
 * - manual: parses user-typed hyphens (e.g. "Sanc-tus" → ['Sanc', 'tus'])
 *
 * Returns an empty array for blank/whitespace-only input.
 */
// Regex matching characters that count as "word letters" (Latin + ligatures + accented).
// Anything else (periods, commas, colons, dashes, asterisks, numbers, etc.) is treated
// as punctuation and stripped before hyphenation.
const LETTER_RE = /[\p{L}]/u;

/**
 * Strip leading/trailing non-letter characters from a word.
 * Returns { leading, core, trailing }. If core is empty, the whole token was
 * punctuation/non-letters and should be skipped entirely.
 */
function stripPunctuation(w: string): { leading: string; core: string; trailing: string } {
  const match = w.match(/^([^\p{L}]*)([\s\S]*?)([^\p{L}]*)$/u);
  if (!match) return { leading: '', core: w, trailing: '' };
  return { leading: match[1] ?? '', core: match[2] ?? '', trailing: match[3] ?? '' };
}

export function syllabifyText(
  raw: string,
  mode: HyphenationMode
): SyllabifiedWord[] {
  if (!raw.trim()) return [];
  const words = raw.trim().split(/\s+/);

  if (mode === 'manual') {
    return words
      .filter((w) => LETTER_RE.test(w))
      .map((w) => ({
        original: w.replace(/-/g, ''),
        syllables: w.split('-').filter(Boolean),
      }));
  }

  const result: SyllabifiedWord[] = [];
  for (const w of words) {
    const { leading, core, trailing } = stripPunctuation(w);
    // Skip tokens that have no letters at all (pure punctuation, e.g. "—", "...", "*")
    if (!core || !LETTER_RE.test(core)) continue;

    let syllables: string[];
    if (mode === 'sung' || mode === 'liturgical-typographic') {
      const normalized = normalizeLigatures(core);
      syllables = liturgicalEngine.hyphenate(normalized);
      if (mode === 'sung') {
        // Clayton R1-R11 post-processor (sung convention). Pass the
        // ligature-expanded word so position-based rules (R11 ae/oe digraph)
        // can match `æ`/`œ` inputs that Hypher already saw as `ae`/`oe`.
        syllables = applySungRules(syllables, normalized);
        // Override dictionary wins over rule output when the word matches.
        const overrideKey = normalizeOverrideKey(core);
        if (overrideKey in liturgicalOverrides) {
          syllables = liturgicalOverrides[overrideKey];
        }
      }
    } else if (mode === 'classical') {
      syllables = splitWithHyphen(core, classicalHyphenate);
    } else {
      syllables = splitWithHyphen(core, modernHyphenate);
    }

    // Hypher may return an empty array for very short words — fall back to single syllable
    if (syllables.length === 0) syllables = [core];

    // Reattach punctuation: leading goes on first syllable, trailing on last
    if (leading) syllables[0] = leading + syllables[0];
    if (trailing) syllables[syllables.length - 1] = syllables[syllables.length - 1] + trailing;

    result.push({ original: w, syllables });
  }
  return result;
}
