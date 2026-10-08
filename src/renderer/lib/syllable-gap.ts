// src/renderer/lib/syllable-gap.ts
//
// "Sem neuma nesta página": one model for Recortes (syllable strip) and the
// Tabela (cell menu). A gap belongs to a page (line.gaps). Legacy projects
// may also mark a gap as a null box on the page or a null crop in
// source.syllableCuts; unmarking clears those too, so the cell really
// becomes pending.

import { hasAnyBox } from "@shared/box-frame";
import type { ManuscriptLine, ManuscriptSource } from "./models";
import { resolveCellLine } from "./tableUtils";

/** True when the page marks syllable `idx` as having no neume (gaps or a legacy null box). */
export function isLineGap(line: ManuscriptLine, idx: number): boolean {
  return line.gaps.includes(idx) || line.syllableBoxes?.[idx] === null;
}

export interface GapTogglePlan {
  /** True: the syllable becomes a gap on this page. */
  adding: boolean;
  /** The page's gaps after the toggle (sorted). */
  gaps: number[];
  /** The page's box entry for the syllable goes: its box when marking, a legacy null when unmarking. */
  dropBox: boolean;
  /** source.syllableCuts[idx] goes: a legacy null crop when unmarking. */
  dropCut: boolean;
}

/** What toggling the gap of syllable `idx` on page `line` changes. Pure. */
export function planGapToggle(source: ManuscriptSource, line: ManuscriptLine, idx: number): GapTogglePlan {
  const entry = line.syllableBoxes?.[idx];
  if (!isLineGap(line, idx)) {
    // A box and a gap for one syllable would contradict: the box goes.
    return { adding: true, gaps: [...line.gaps, idx].sort((a, b) => a - b), dropBox: entry != null, dropCut: false };
  }
  return {
    adding: false,
    gaps: line.gaps.filter((g) => g !== idx),
    dropBox: entry === null,
    dropCut: source.syllableCuts[idx] === null,
  };
}

/** Applies a plan to the source (stored frame: removing a key needs no frame change). */
function applyPlan(source: ManuscriptSource, lineId: string, idx: number, plan: GapTogglePlan): ManuscriptSource {
  const lines = source.lines.map((l) => {
    if (l.id !== lineId) return l;
    if (!plan.dropBox) return { ...l, gaps: plan.gaps };
    const { [idx]: _dropped, ...boxes } = l.syllableBoxes ?? {};
    return { ...l, gaps: plan.gaps, syllableBoxes: boxes, confirmed: hasAnyBox(boxes) };
  });
  if (!plan.dropCut) return { ...source, lines };
  const { [idx]: _cut, ...syllableCuts } = source.syllableCuts;
  return { ...source, lines, syllableCuts };
}

/**
 * Tabela "Sem neuma nesta página" on cell (source, idx): toggles the gap on
 * the page that decides the cell (resolveCellLine), else on the first page
 * covering the syllable. Other pages are never touched. With no covering
 * page at all, only the legacy syllableCuts entry is toggled (null = gap).
 */
export function toggleCellGap(source: ManuscriptSource, idx: number): ManuscriptSource {
  const line =
    resolveCellLine(source, idx)?.line ??
    source.lines.find((l) => idx >= l.syllableRange.start && idx <= l.syllableRange.end);
  if (line) return applyPlan(source, line.id, idx, planGapToggle(source, line, idx));
  const { [idx]: current, ...rest } = source.syllableCuts;
  return { ...source, syllableCuts: current === null ? rest : { ...rest, [idx]: null } };
}
