// src/renderer/components/slice-editor/SlicePreviewCell.tsx

import type { StoredImage } from '../../lib/models';

interface SlicePreviewCellProps {
  syllableText: string;       // e.g. "San-"
  globalIdx: number;          // global syllable index
  image: StoredImage;         // the full manuscript image (not a crop)
  sliceLeftFrac: number;      // left edge fraction 0.0–1.0
  sliceRightFrac: number;     // right edge fraction 0.0–1.0
  isHovered: boolean;
  isWordBoundaryRight: boolean;  // true if a word ends at this syllable
  onHover: (idx: number | null) => void;
}

export function SlicePreviewCell({
  syllableText,
  globalIdx,
  image,
  sliceLeftFrac,
  sliceRightFrac,
  isHovered,
  isWordBoundaryRight,
  onHover,
}: SlicePreviewCellProps) {
  const sliceWidthFrac = sliceRightFrac - sliceLeftFrac;
  if (sliceWidthFrac <= 0) return null;

  const bgSize = `${(1 / sliceWidthFrac) * 100}% auto`;
  const bgPos  = `${(-sliceLeftFrac / sliceWidthFrac) * 100}% 0`;

  return (
    <div
      className={[
        'flex flex-col items-center flex-shrink-0',
        isWordBoundaryRight ? 'border-r-2 border-gray-500' : 'border-r border-gray-300',
      ].join(' ')}
      style={{ minWidth: 40 }}
      onMouseEnter={() => onHover(globalIdx)}
      onMouseLeave={() => onHover(null)}
    >
      {/* Syllable label */}
      <div
        className={[
          'text-xs px-1 py-0.5 font-mono select-none',
          isHovered ? 'text-indigo-700 font-bold' : 'text-gray-600',
        ].join(' ')}
      >
        {syllableText}
      </div>

      {/* Image crop via CSS background-position */}
      <div
        className={[
          'w-full h-14 bg-no-repeat',
          isHovered ? 'ring-2 ring-indigo-400 ring-inset' : '',
        ].join(' ')}
        style={{
          backgroundImage: `url(${image.dataUrl})`,
          backgroundSize: bgSize,
          backgroundPosition: bgPos,
        }}
      />
    </div>
  );
}
