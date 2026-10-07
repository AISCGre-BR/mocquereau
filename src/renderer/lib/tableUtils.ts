// src/renderer/lib/tableUtils.ts

import type { ManuscriptSource, SyllableBox, StoredImage, SyllabifiedWord } from './models';
import { boxesInView } from '@shared/box-frame';

// ── Cell state ───────────────────────────────────────────────────────────────

export type CellState =
  | { kind: 'filled';   image: StoredImage; box: SyllableBox }
  | { kind: 'gap' }
  | { kind: 'unfilled' };

/**
 * Resolves the display state for cell (source, syllableIdx).
 *
 * Strategy (per CONTEXT.md code_context):
 *   1. Find the ManuscriptLine whose syllableRange covers syllableIdx.
 *   2. If line exists and syllableBoxes[syllableIdx] === null → gap.
 *   3. If line exists and syllableBoxes[syllableIdx] is a box → filled.
 *   4. If no line covers this syllable → unfilled (pending work).
 *
 * Falls back to syllableCuts for Phase 4/5 compat (no syllableBoxes).
 */
export function resolveCellState(
  source: ManuscriptSource,
  syllableIdx: number,
): CellState {
  // Phase 5.1+ path: look up via syllableBoxes on lines
  for (const line of source.lines) {
    const { start, end } = line.syllableRange;
    if (syllableIdx < start || syllableIdx > end) continue;

    // Line covers this syllable
    if (line.syllableBoxes) {
      // Spec R1: boxes are stored in line.boxFrame; show them in the current view.
      const entry = boxesInView(line)[syllableIdx];
      if (entry === null) return { kind: 'gap' };
      if (entry !== undefined) return { kind: 'filled', image: line.image, box: entry };
      // entry === undefined: syllable is in range but no box drawn yet
      // check gaps[] for backward-compat
    }
    // Fall back: check gaps array
    if (line.gaps.includes(syllableIdx)) return { kind: 'gap' };
    // In range, not a gap, no box → unfilled
    return { kind: 'unfilled' };
  }

  // No line covers this index — check syllableCuts as Phase 4/5 fallback
  if (syllableIdx in source.syllableCuts) {
    const cut = source.syllableCuts[syllableIdx];
    if (cut === null) return { kind: 'gap' };
    // syllableCuts has no box coords — render as plain <img> fallback;
    // encode as filled with a synthetic 0,0,1,1 box and the cut as image
    return { kind: 'filled', image: cut, box: { x: 0, y: 0, w: 1, h: 1 } };
  }

  return { kind: 'unfilled' };
}

// ── Word boundary ────────────────────────────────────────────────────────────

/**
 * Returns true if syllableIdx is the LAST syllable of a word.
 * Used to decide whether to render a 2px right border (word boundary, D-05).
 *
 * @param words  project.text.words (SyllabifiedWord[])
 * @param syllableIdx  global 0-based syllable index
 */
export function isWordBoundary(
  words: SyllabifiedWord[],
  syllableIdx: number,
): boolean {
  let cursor = 0;
  for (const word of words) {
    cursor += word.syllables.length;
    if (syllableIdx === cursor - 1) return true;
    if (cursor > syllableIdx) break;
  }
  return false;
}
