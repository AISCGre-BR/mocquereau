// src/renderer/lib/migrate-hyphenation.ts
//
// Migrates a project from one hyphenation mode to another, remapping all
// syllable-indexed data (syllableBoxes, syllableRange, gaps, syllableCuts)
// so that existing crops stay aligned when the word/syllable split shifts.
//
// Strategy: global syllable indices are split per word. For each word:
//   - If the word has the same syllable count in both modes → boxes map 1:1.
//   - If the count changed → boxes for that word are dropped (user re-cuts).
// Because the raw text doesn't change, word count is always preserved —
// only per-word syllable counts vary (mostly via R11 ae/oe digraph).

import type { MocquereauProject, SyllabifiedWord, SyllableBox, StoredImage } from './models';
import { syllabifyText, type HyphenationMode } from './syllabify';

// ── Word-boundary table ──────────────────────────────────────────────────────
interface WordBounds {
  wordIdx: number;
  startGlobalIdx: number;
  count: number;
}

function buildWordBounds(words: SyllabifiedWord[]): WordBounds[] {
  const out: WordBounds[] = [];
  let g = 0;
  for (let w = 0; w < words.length; w++) {
    out.push({ wordIdx: w, startGlobalIdx: g, count: words[w].syllables.length });
    g += words[w].syllables.length;
  }
  return out;
}

/**
 * Remap a single global syllable index from old split → new split.
 * Returns null when the word's syllable count changed (box is dropped).
 */
function remapIdx(oldIdx: number, oldBounds: WordBounds[], newBounds: WordBounds[]): number | null {
  for (let i = 0; i < oldBounds.length; i++) {
    const b = oldBounds[i];
    if (oldIdx >= b.startGlobalIdx && oldIdx < b.startGlobalIdx + b.count) {
      const localIdx = oldIdx - b.startGlobalIdx;
      const nb = newBounds[i];
      if (!nb) return null;
      if (nb.count !== b.count) return null;
      return nb.startGlobalIdx + localIdx;
    }
  }
  return null;
}

// ── Public API ────────────────────────────────────────────────────────────────

export interface MigrationStats {
  /** Boxes (non-null entries) preserved with updated indices */
  preservedBoxes: number;
  /** Boxes dropped because the owning word changed syllable count */
  droppedBoxes: number;
  /** Words whose syllable split changed (shown to the user) */
  changedWords: Array<{
    word: string;
    oldSplit: string;
    newSplit: string;
  }>;
  /** Total syllable count before/after */
  oldSyllableCount: number;
  newSyllableCount: number;
}

export interface MigrationResult {
  project: MocquereauProject;
  stats: MigrationStats;
}

/**
 * Preview a migration without applying it.
 * Useful for showing a confirmation dialog with counts.
 */
export function previewMigration(
  project: MocquereauProject,
  newMode: HyphenationMode,
): MigrationStats {
  const oldWords = project.text.words;
  const newWords = syllabifyText(project.text.raw, newMode);
  const oldBounds = buildWordBounds(oldWords);
  const newBounds = buildWordBounds(newWords);

  const changedWords: MigrationStats['changedWords'] = [];
  for (let i = 0; i < oldBounds.length; i++) {
    const ob = oldBounds[i];
    const nb = newBounds[i];
    if (!nb || nb.count !== ob.count) {
      changedWords.push({
        word: oldWords[i].original,
        oldSplit: oldWords[i].syllables.join('-'),
        newSplit: newWords[i]?.syllables.join('-') ?? '—',
      });
    }
  }

  let preservedBoxes = 0;
  let droppedBoxes = 0;
  for (const source of project.sources) {
    for (const line of source.lines) {
      if (!line.syllableBoxes) continue;
      for (const [key, box] of Object.entries(line.syllableBoxes)) {
        if (box === null) continue;
        const newIdx = remapIdx(Number(key), oldBounds, newBounds);
        if (newIdx !== null) preservedBoxes++;
        else droppedBoxes++;
      }
    }
    for (const [key, cut] of Object.entries(source.syllableCuts ?? {})) {
      if (cut === null) continue;
      const newIdx = remapIdx(Number(key), oldBounds, newBounds);
      if (newIdx !== null) preservedBoxes++;
      else droppedBoxes++;
    }
  }

  const oldSyllableCount = oldBounds.reduce((a, b) => a + b.count, 0);
  const newSyllableCount = newBounds.reduce((a, b) => a + b.count, 0);

  return { preservedBoxes, droppedBoxes, changedWords, oldSyllableCount, newSyllableCount };
}

/**
 * Apply the migration: returns a new project with updated words, mode, and
 * all syllable-indexed data remapped. Never mutates the input project.
 */
export function migrateHyphenation(
  project: MocquereauProject,
  newMode: HyphenationMode,
): MigrationResult {
  const oldWords = project.text.words;
  const newWords = syllabifyText(project.text.raw, newMode);
  const oldBounds = buildWordBounds(oldWords);
  const newBounds = buildWordBounds(newWords);
  const stats = previewMigration(project, newMode);

  // Helper: remap a Record<number, X | null> preserving entries whose index maps
  // cleanly and dropping entries on count-changed words.
  function remapRecord<X>(
    record: Record<number, X | null> | undefined,
  ): Record<number, X | null> {
    if (!record) return {};
    const out: Record<number, X | null> = {};
    for (const [key, value] of Object.entries(record)) {
      const newIdx = remapIdx(Number(key), oldBounds, newBounds);
      if (newIdx !== null) out[newIdx] = value;
    }
    return out;
  }

  // Helper: remap a range. If start/end land in count-changed words, fall back
  // to the nearest stable index (word-start of the same word's new position).
  function remapRange(r: { start: number; end: number }): { start: number; end: number } {
    // For start: walk forward from old start until we find a mappable idx
    let newStart: number | null = null;
    for (let i = r.start; i <= r.end && newStart === null; i++) {
      newStart = remapIdx(i, oldBounds, newBounds);
    }
    // For end: walk backward from old end until we find a mappable idx
    let newEnd: number | null = null;
    for (let i = r.end; i >= r.start && newEnd === null; i--) {
      newEnd = remapIdx(i, oldBounds, newBounds);
    }
    const totalNew = newBounds.reduce((a, b) => a + b.count, 0);
    return {
      start: newStart ?? 0,
      end: newEnd ?? Math.max(0, totalNew - 1),
    };
  }

  const newSources = project.sources.map((source) => ({
    ...source,
    lines: source.lines.map((line) => ({
      ...line,
      syllableRange: remapRange(line.syllableRange),
      gaps: (line.gaps ?? [])
        .map((idx) => remapIdx(idx, oldBounds, newBounds))
        .filter((v): v is number => v !== null),
      syllableBoxes: line.syllableBoxes
        ? remapRecord<SyllableBox>(line.syllableBoxes)
        : line.syllableBoxes,
    })),
    syllableCuts: remapRecord<StoredImage>(source.syllableCuts),
  }));

  return {
    project: {
      ...project,
      text: { ...project.text, words: newWords, hyphenationMode: newMode },
      sources: newSources,
    },
    stats,
  };
}
