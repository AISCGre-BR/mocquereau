// src/renderer/lib/tableUtils.ts

import type { ManuscriptLine, ManuscriptSource, SyllableBox, StoredImage, SyllabifiedWord } from './models';
import { boxesInView } from '@shared/box-frame';

// ── Cell state ───────────────────────────────────────────────────────────────

export type CellState =
  | { kind: 'filled';   image: StoredImage; box: SyllableBox }
  | { kind: 'gap' }
  | { kind: 'unfilled' };

/**
 * The page that decides cell (source, syllableIdx): the first page, in page
 * order, whose range covers the syllable and that has a box or a gap for it
 * there. A page that covers the syllable but has nothing for it does not
 * decide: the next covering page is consulted. Null when no page decides.
 * Shared by the Tabela (resolveCellState) and the DOCX export.
 */
export function resolveCellLine(
  source: ManuscriptSource,
  syllableIdx: number,
): { kind: 'filled'; line: ManuscriptLine; box: SyllableBox } | { kind: 'gap'; line: ManuscriptLine } | null {
  for (const line of source.lines) {
    const { start, end } = line.syllableRange;
    if (syllableIdx < start || syllableIdx > end) continue;
    if (line.syllableBoxes) {
      // Spec R1: boxes are stored in line.boxFrame; show them in the current view.
      const entry = boxesInView(line)[syllableIdx];
      if (entry === null) return { kind: 'gap', line };
      if (entry !== undefined) return { kind: 'filled', line, box: entry };
    }
    if (line.gaps.includes(syllableIdx)) return { kind: 'gap', line };
    // In range, no box and no gap here: the next covering page may have it.
  }
  return null;
}

/**
 * Resolves the display state for cell (source, syllableIdx): the deciding
 * page (resolveCellLine), else the Phase 4/5 syllableCuts, else unfilled.
 */
export function resolveCellState(
  source: ManuscriptSource,
  syllableIdx: number,
): CellState {
  const hit = resolveCellLine(source, syllableIdx);
  if (hit?.kind === 'gap') return { kind: 'gap' };
  if (hit?.kind === 'filled') return { kind: 'filled', image: hit.line.image, box: hit.box };

  // No page decides — check syllableCuts as Phase 4/5 fallback
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

/** Fólio da primeira página que tenha um (ou "" se nenhuma tiver). */
export function firstFolio(s: ManuscriptSource): string {
  return s.lines.find((l) => l.folio?.trim())?.folio?.trim() ?? "";
}

/**
 * Appends a new line to the source. A pending `folioHint` (carried from an
 * import) becomes the folio of the new line when it has none, and is dropped
 * from the metadata in the same update.
 */
export function appendLineConsumingFolioHint(source: ManuscriptSource, line: ManuscriptLine): ManuscriptSource {
  const hint = source.metadata.folioHint;
  if (!hint) return { ...source, lines: [...source.lines, line] };
  const { folioHint: _consumed, ...metadata } = source.metadata;
  const placed = line.folio?.trim() ? line : { ...line, folio: hint };
  return { ...source, metadata, lines: [...source.lines, placed] };
}
