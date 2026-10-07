// src/renderer/components/slice-editor/SlicePreview.tsx

import { SlicePreviewCell } from './SlicePreviewCell';
import { flattenSyllables } from '../../lib/sliceUtils';
import type { StoredImage, SyllabifiedWord, SyllableBox } from '../../lib/models';
import { useTranslation } from 'react-i18next';

interface SlicePreviewProps {
  image: StoredImage | null;
  words: SyllabifiedWord[];
  syllableBoxes: Record<number, SyllableBox | null>;  // replaces dividers
  activeSyllableIdx: number | null;                   // added
  syllableRange: { start: number; end: number } | null;
  gaps: number[];
  hoveredSyllableIdx: number | null;
  onHover: (idx: number | null) => void;
  onActivate: (idx: number) => void;  // fires when label clicked in preview
}

export function SlicePreview({
  image,
  words,
  syllableBoxes,
  activeSyllableIdx,
  syllableRange,
  gaps,
  hoveredSyllableIdx,
  onHover,
  onActivate,
}: SlicePreviewProps) {
  const { t } = useTranslation();
  const allSyllables = flattenSyllables(words);

  // Build word boundary set: global indices that are the LAST syllable of a word
  const wordBoundarySet = new Set<number>();
  let offset = 0;
  for (const w of words) {
    offset += w.syllables.length;
    wordBoundarySet.add(offset - 1);
  }

  const gapSet = new Set(gaps);
  const cells: React.ReactNode[] = [];

  if (syllableRange && image) {
    for (let globalIdx = syllableRange.start; globalIdx <= syllableRange.end; globalIdx++) {
      const box = syllableBoxes[globalIdx];
      const isGap = gapSet.has(globalIdx);
      const syllableText = allSyllables[globalIdx] ?? '?';
      const isWordBoundaryRight = wordBoundarySet.has(globalIdx);
      const isHovered = globalIdx === hoveredSyllableIdx;
      const isActive = globalIdx === activeSyllableIdx;

      if (isGap || box === null || box === undefined) {
        // Gap or no box yet — show placeholder
        cells.push(
          <div
            key={globalIdx}
            className={[
              'flex flex-col items-center flex-shrink-0',
              isWordBoundaryRight ? 'border-r-2 border-rule-strong' : 'border-r border-rule',
            ].join(' ')}
            style={{ minWidth: 40 }}
          >
            <div
              className="text-xs px-1 py-0.5 font-mono text-ink-muted cursor-pointer hover:text-ink-soft"
              onClick={() => onActivate(globalIdx)}
            >
              {syllableText}
            </div>
            <div className="w-full h-14 bg-parchment border border-dashed border-rule-soft flex items-center justify-center text-ink-muted text-xs">
              {isGap ? '—' : '+'}
            </div>
          </div>
        );
      } else {
        // Has a box
        cells.push(
          <SlicePreviewCell
            key={globalIdx}
            syllableText={syllableText}
            globalIdx={globalIdx}
            image={image}
            box={box}
            isActive={isActive}
            isHovered={isHovered}
            isWordBoundaryRight={isWordBoundaryRight}
            onHover={onHover}
            onClick={onActivate}
          />
        );
      }
    }
  }

  return (
    <div className="flex flex-col border-t border-rule-soft bg-surface">
      <div className="px-3 py-1 text-xs font-semibold text-ink-muted uppercase tracking-wide border-b border-rule-soft">
        {t('slicePreview.title')}
      </div>
      <div className="flex flex-row overflow-x-auto py-1 px-2 min-h-[5rem]">
        {cells.length > 0 ? cells : (
          <div className="flex items-center text-xs text-ink-muted px-2">
            {t('slicePreview.empty')}
          </div>
        )}
      </div>
    </div>
  );
}
