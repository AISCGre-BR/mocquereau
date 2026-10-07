// src/renderer/lib/syllable-edit.ts
//
// Manual syllable edits (split / merge) and the remapping of all syllable-indexed
// data (syllableBoxes, syllableRange, gaps, syllableCuts) that follows from them.
// Indices are GLOBAL (position in flattenSyllables(words)).
//
// Line `dividers` are legacy (derived from the old linear-divider model, not
// index-keyed) and are deliberately left untouched.

import type { MocquereauProject, SyllabifiedWord } from './models';

/** Split syllable `sylIdx` of word `wordIdx` at character position `at` (1 <= at < length). */
export function splitSyllable(
  words: SyllabifiedWord[],
  wordIdx: number,
  sylIdx: number,
  at: number,
): SyllabifiedWord[] | null {
  const syl = words[wordIdx]?.syllables[sylIdx];
  if (syl === undefined || !Number.isInteger(at) || at < 1 || at >= syl.length) return null;
  return words.map((w, i) =>
    i !== wordIdx
      ? w
      : {
          ...w,
          syllables: [
            ...w.syllables.slice(0, sylIdx),
            syl.slice(0, at),
            syl.slice(at),
            ...w.syllables.slice(sylIdx + 1),
          ],
        },
  );
}

/** Merge syllable `sylIdx` with `sylIdx + 1` of the same word. */
export function mergeSyllables(
  words: SyllabifiedWord[],
  wordIdx: number,
  sylIdx: number,
): SyllabifiedWord[] | null {
  const sy = words[wordIdx]?.syllables;
  if (!sy || sylIdx < 0 || sylIdx + 1 >= sy.length) return null;
  return words.map((w, i) =>
    i !== wordIdx
      ? w
      : {
          ...w,
          syllables: [
            ...sy.slice(0, sylIdx),
            sy[sylIdx] + sy[sylIdx + 1],
            ...sy.slice(sylIdx + 2),
          ],
        },
  );
}

type Edit =
  | { kind: 'split'; k: number }
  | { kind: 'merge'; k: number }
  | { kind: 'other' };

/** Infers whether `next` is a split or a merge of `prev` (and at which local index). */
function detectEdit(prev: string[], next: string[]): Edit {
  const n = prev.length;
  const m = next.length;
  if (m !== n + 1 && m !== n - 1) return { kind: 'other' };
  const small = Math.min(n, m);
  let k = 0;
  while (k < small && prev[k] === next[k]) k++;
  return m > n ? { kind: 'split', k } : { kind: 'merge', k };
}

/**
 * Replaces the syllables of word `wordIdx` and remaps every syllable-indexed
 * structure of every source. Does not mutate the input.
 *
 * - split of k: box/gap/cut of k stays on the first part; the new part has none.
 * - merge of k,k+1: keeps the box/cut of k (or that of k+1 if k has none).
 * - anything else (same count or larger changes): entries in the word keep their
 *   local index while it exists; the rest are dropped.
 */
export function replaceWordSyllables(
  project: MocquereauProject,
  wordIdx: number,
  syllables: string[],
): MocquereauProject {
  const words = project.text.words;
  const word = words[wordIdx];
  if (!word) return project;

  const start = words.slice(0, wordIdx).reduce((a, w) => a + w.syllables.length, 0);
  const n = word.syllables.length;
  const m = syllables.length;
  const delta = m - n;
  const edit = detectEdit(word.syllables, syllables);

  /** New global index range [first, last] covered by old global index g; null if dropped. */
  function mapIdx(g: number): [number, number] | null {
    if (g < start) return [g, g];
    if (g >= start + n) return [g + delta, g + delta];
    const local = g - start;
    if (edit.kind === 'split') {
      if (local < edit.k) return [g, g];
      if (local === edit.k) return [g, g + 1];
      return [g + 1, g + 1];
    }
    if (edit.kind === 'merge') {
      if (local <= edit.k) return [g, g];
      return [g - 1, g - 1];
    }
    return local < m ? [g, g] : null;
  }
  const mapOne = (g: number): number | null => mapIdx(g)?.[0] ?? null;

  function remapRecord<X>(rec: Record<number, X | null> | undefined): Record<number, X | null> {
    const out: Record<number, X | null> = {};
    if (!rec) return out;
    // Merge: the surviving entry is k's, unless k has nothing (null/absent), then k+1's.
    const mergeFrom = edit.kind === 'merge' ? start + edit.k + 1 : -1;
    for (const [key, value] of Object.entries(rec)) {
      const g = Number(key);
      if (g === mergeFrom) continue;
      const to = mapOne(g);
      if (to !== null) out[to] = value;
    }
    if (edit.kind === 'merge') {
      const k = start + edit.k;
      const a = rec[k];
      const b = rec[mergeFrom];
      if ((a === null || a === undefined) && b !== undefined) out[k] = b;
    }
    return out;
  }

  const sources = project.sources.map((source) => ({
    ...source,
    lines: source.lines.map((line) => {
      let range = line.syllableRange;
      const s = mapIdx(range.start);
      const e = mapIdx(range.end);
      const ns = s ? s[0] : mapOne(range.start) ?? 0;
      const ne = e ? e[1] : Math.max(ns, range.end + delta);
      range = { start: ns, end: Math.max(ns, ne) };
      const gaps = [...new Set(
        (line.gaps ?? []).map(mapOne).filter((v): v is number => v !== null),
      )].sort((a, b) => a - b);
      return {
        ...line,
        syllableRange: range,
        gaps,
        syllableBoxes: line.syllableBoxes ? remapRecord(line.syllableBoxes) : line.syllableBoxes,
      };
    }),
    syllableCuts: remapRecord(source.syllableCuts),
  }));

  return {
    ...project,
    text: {
      ...project.text,
      words: words.map((w, i) => (i === wordIdx ? { ...w, syllables: [...syllables] } : w)),
    },
    sources,
  };
}
