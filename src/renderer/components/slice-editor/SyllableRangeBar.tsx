// src/renderer/components/slice-editor/SyllableRangeBar.tsx

import { useEffect, useRef, useState } from 'react';
import type { SyllabifiedWord } from '../../lib/models';
import { flattenSyllables } from '../../lib/sliceUtils';
import { SyllableChip } from '../SyllableChip';

// ── Props ─────────────────────────────────────────────────────────────────────

interface SyllableRangeBarProps {
  words: SyllabifiedWord[];
  syllableRange: { start: number; end: number } | null;
  gaps: number[];
  hoveredSyllableIdx: number | null;
  activeSyllableIdx: number | null;   // which chip is currently being marked — auto-scrolls into view
  coveredSyllables: number[];   // indices confirmed in other lines
  onRangeChange: (range: { start: number; end: number }) => void;
  onGapToggle: (globalIdx: number) => void;
  onHover: (globalIdx: number | null) => void;
  /** Rename-only: receive new text for a global syllable index. */
  onRename: (globalIdx: number, newText: string) => void;
}

// ── Chip state ────────────────────────────────────────────────────────────────

type ChipState = 'inactive' | 'active' | 'gap' | 'covered';

function getChipState(
  i: number,
  syllableRange: { start: number; end: number } | null,
  gaps: number[],
  coveredSyllables: number[],
): ChipState {
  if (coveredSyllables.includes(i)) return 'covered';
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
  coveredSyllables: number[],
  onRangeChange: (range: { start: number; end: number }) => void,
  onGapToggle: (globalIdx: number) => void,
): void {
  const state = getChipState(i, syllableRange, gaps, coveredSyllables);
  if (state === 'covered') return;  // locked — cannot re-select

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
    'inline-flex items-center px-2 py-1 text-xs rounded select-none transition-colors';
  let stateClass = '';

  if (state === 'inactive') {
    stateClass = 'bg-gray-100 text-gray-400 cursor-pointer hover:bg-gray-200';
  } else if (state === 'active') {
    stateClass =
      'bg-indigo-100 text-indigo-800 border border-indigo-300 cursor-pointer hover:bg-indigo-200';
  } else if (state === 'gap') {
    stateClass =
      'bg-red-50 text-red-400 border border-dashed border-red-300 cursor-pointer';
  } else {
    // covered
    stateClass =
      'bg-green-100 text-green-700 border border-green-400 cursor-not-allowed opacity-80';
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
  activeSyllableIdx,
  coveredSyllables,
  onRangeChange,
  onGapToggle,
  onHover,
  onRename,
}: SyllableRangeBarProps) {
  const allSyllables = flattenSyllables(words);
  const scrollRef = useRef<HTMLDivElement>(null);
  const chipRefs = useRef<Array<HTMLSpanElement | null>>([]);
  const [editingKey, setEditingKey] = useState<number | null>(null);

  // Build word boundary set — boundary falls AFTER the last syllable of each word
  const wordBoundarySet = new Set<number>();
  let offset = 0;
  for (const w of words) {
    offset += w.syllables.length;
    wordBoundarySet.add(offset - 1); // index of last syllable of this word
  }

  // Auto-scroll: keep the active syllable chip in view as the user advances
  // (replaces the old flex-wrap layout that stacked chips vertically for long pieces)
  useEffect(() => {
    if (activeSyllableIdx == null) return;
    const chip = chipRefs.current[activeSyllableIdx];
    if (chip && scrollRef.current) {
      chip.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
    }
  }, [activeSyllableIdx]);

  return (
    <div className="flex flex-col gap-1">
      <div
        ref={scrollRef}
        className="flex flex-row flex-nowrap items-center gap-y-1 overflow-x-auto py-2 px-1"
      >
        {allSyllables.map((syllable, i) => {
          const state = getChipState(i, syllableRange, gaps, coveredSyllables);
          const isHovered = i === hoveredSyllableIdx;
          const isEditing = editingKey === i;
          // Rename is purely textual (D-01 item 6 — count invariant preserved),
          // so it applies to ANY syllable, including covered ones. Editing text
          // on a covered syllable doesn't affect boxes — just updates
          // words[].syllables[].
          const canEdit = true;
          const label =
            state === 'gap' ? `✕ ${syllable}` :
            state === 'covered' ? `✓ ${syllable}` :
            syllable;

          return (
            <span
              key={i}
              ref={(el) => { chipRefs.current[i] = el; }}
              className="inline-flex items-center flex-shrink-0"
            >
              {isEditing ? (
                <SyllableChip
                  syllable={syllable}
                  isEditing={true}
                  onEnterEdit={() => {}}
                  onCommitEdit={(value) => {
                    const trimmed = value.trim();
                    if (trimmed.length > 0 && trimmed !== syllable) {
                      onRename(i, trimmed);
                    }
                    setEditingKey(null);
                  }}
                  onCancelEdit={() => setEditingKey(null)}
                />
              ) : (
                <span
                  className={chipClassName(state, isHovered)}
                  onMouseEnter={() => onHover(i)}
                  onMouseLeave={() => onHover(null)}
                  onClick={() =>
                    handleChipClick(i, syllableRange, gaps, coveredSyllables, onRangeChange, onGapToggle)
                  }
                  onDoubleClick={(e) => {
                    if (!canEdit) return;
                    e.preventDefault();
                    e.stopPropagation();
                    setEditingKey(i);
                  }}
                  role={state === 'covered' ? undefined : 'button'}
                  tabIndex={state === 'covered' ? -1 : 0}
                  onKeyDown={e => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      handleChipClick(i, syllableRange, gaps, coveredSyllables, onRangeChange, onGapToggle);
                    } else if (e.key === 'F2' && canEdit) {
                      e.preventDefault();
                      setEditingKey(i);
                    } else if (e.key === 'Tab') {
                      // Suprimimos o focus traversal nativo do browser — o
                      // window-level handler do SliceEditor é a ÚNICA autoridade
                      // sobre activeSyllableIdx. Sem isso, o browser e o
                      // handler global brigavam pelo scroll/foco do bar.
                      e.preventDefault();
                    }
                  }}
                >
                  {label}
                </span>
              )}
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
