// src/renderer/components/slice-editor/SyllableRangeBar.tsx

import type { SyllabifiedWord } from '../../lib/models';
import { flattenSyllables } from '../../lib/sliceUtils';

// ── Props ─────────────────────────────────────────────────────────────────────

interface SyllableRangeBarProps {
  words: SyllabifiedWord[];
  syllableRange: { start: number; end: number } | null;
  gaps: number[];
  hoveredSyllableIdx: number | null;
  onRangeChange: (range: { start: number; end: number }) => void;
  onGapToggle: (globalIdx: number) => void;
  onHover: (globalIdx: number | null) => void;
}

// ── Chip state ────────────────────────────────────────────────────────────────

type ChipState = 'inactive' | 'active' | 'gap';

function getChipState(
  i: number,
  syllableRange: { start: number; end: number } | null,
  gaps: number[],
): ChipState {
  if (syllableRange === null || i < syllableRange.start || i > syllableRange.end) {
    return 'inactive';
  }
  if (gaps.includes(i)) {
    return 'gap';
  }
  return 'active';
}

// ── Click logic ───────────────────────────────────────────────────────────────

function handleChipClick(
  i: number,
  syllableRange: { start: number; end: number } | null,
  gaps: number[],
  onRangeChange: (range: { start: number; end: number }) => void,
  onGapToggle: (globalIdx: number) => void,
): void {
  const state = getChipState(i, syllableRange, gaps);

  if (state === 'inactive') {
    if (syllableRange === null) {
      onRangeChange({ start: i, end: i });
    } else if (i < syllableRange.start) {
      onRangeChange({ start: i, end: syllableRange.end });
    } else {
      // i > syllableRange.end
      onRangeChange({ start: syllableRange.start, end: i });
    }
  } else if (state === 'active' || state === 'gap') {
    // Toggle gap in both cases (active → gap, gap → active)
    onGapToggle(i);
  }
}

// ── Chip styles ───────────────────────────────────────────────────────────────

function chipClassName(state: ChipState, isHovered: boolean): string {
  const base =
    'inline-flex items-center px-2 py-1 text-xs rounded select-none cursor-pointer transition-colors';
  let stateClass = '';

  if (state === 'inactive') {
    stateClass = 'bg-gray-100 text-gray-400 cursor-pointer hover:bg-gray-200';
  } else if (state === 'active') {
    stateClass =
      'bg-indigo-100 text-indigo-800 border border-indigo-300 hover:bg-indigo-200';
  } else {
    // gap
    stateClass =
      'bg-red-50 text-red-400 border border-dashed border-red-300';
  }

  const hoverClass =
    isHovered ? 'ring-2 ring-offset-1 ring-indigo-400' : '';

  return [base, stateClass, hoverClass].filter(Boolean).join(' ');
}

// ── Component ─────────────────────────────────────────────────────────────────

export function SyllableRangeBar({
  words,
  syllableRange,
  gaps,
  hoveredSyllableIdx,
  onRangeChange,
  onGapToggle,
  onHover,
}: SyllableRangeBarProps) {
  const allSyllables = flattenSyllables(words);

  // Build word boundary set — boundary falls AFTER the last syllable of each word
  const wordBoundarySet = new Set<number>();
  let offset = 0;
  for (const w of words) {
    offset += w.syllables.length;
    wordBoundarySet.add(offset - 1); // index of last syllable of this word
  }

  return (
    <div className="flex flex-col gap-1">
      <div className="flex flex-row flex-wrap items-center gap-y-1 overflow-x-auto py-2 px-1">
        {allSyllables.map((syllable, i) => {
          const state = getChipState(i, syllableRange, gaps);
          const isHovered = i === hoveredSyllableIdx;
          const label = state === 'gap' ? `✕ ${syllable}` : syllable;

          return (
            <span key={i} className="inline-flex items-center">
              <span
                className={chipClassName(state, isHovered)}
                onMouseEnter={() => onHover(i)}
                onMouseLeave={() => onHover(null)}
                onClick={() =>
                  handleChipClick(i, syllableRange, gaps, onRangeChange, onGapToggle)
                }
                role="button"
                tabIndex={0}
                onKeyDown={e => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    handleChipClick(i, syllableRange, gaps, onRangeChange, onGapToggle);
                  }
                }}
              >
                {label}
              </span>
              {/* Word boundary separator after each chip (except the last) */}
              {i < allSyllables.length - 1 && (
                wordBoundarySet.has(i) ? (
                  // Thicker word boundary: 2px
                  <span className="w-0.5 h-5 bg-gray-400 mx-0.5 self-center flex-shrink-0" />
                ) : (
                  // Intra-word syllable boundary: 1px
                  <span className="w-px h-4 bg-gray-200 mx-0.5 self-center flex-shrink-0" />
                )
              )}
            </span>
          );
        })}
      </div>
    </div>
  );
}
