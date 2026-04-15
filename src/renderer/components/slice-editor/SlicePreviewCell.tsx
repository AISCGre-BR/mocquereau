// src/renderer/components/slice-editor/SlicePreviewCell.tsx

import type { StoredImage, SyllableBox } from '../../lib/models';

interface SlicePreviewCellProps {
  syllableText: string;
  globalIdx: number;
  image: StoredImage;
  box: SyllableBox;         // replaces sliceLeftFrac/sliceRightFrac
  isActive: boolean;        // true when this is the activeSyllableIdx (blue ring)
  isHovered: boolean;
  isWordBoundaryRight: boolean;
  onHover: (idx: number | null) => void;
  onClick: (idx: number) => void;  // label click → activate syllable
}

export function SlicePreviewCell({
  syllableText,
  globalIdx,
  image,
  box,
  isActive,
  isHovered,
  isWordBoundaryRight,
  onHover,
  onClick,
}: SlicePreviewCellProps) {
  if (box.w <= 0 || box.h <= 0) return null;

  const bgSizeX = (1 / box.w) * 100;   // percent
  const bgSizeY = (1 / box.h) * 100;   // percent
  const bgPosX  = (-box.x / box.w) * 100;  // percent
  const bgPosY  = (-box.y / box.h) * 100;  // percent

  const bgSize = `${bgSizeX}% ${bgSizeY}%`;
  const bgPos  = `${bgPosX}% ${bgPosY}%`;

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
          'text-xs px-1 py-0.5 font-mono select-none cursor-pointer',
          isActive   ? 'text-blue-700 font-bold' : '',
          isHovered  ? 'text-indigo-700 font-bold' : '',
          !isActive && !isHovered ? 'text-gray-600' : '',
        ].filter(Boolean).join(' ')}
        onClick={() => onClick(globalIdx)}
      >
        {syllableText}
      </div>

      {/* Image crop via CSS background-position (2D box) */}
      <div
        className={[
          'w-full h-14 bg-no-repeat',
          isActive  ? 'ring-2 ring-blue-500 ring-inset' : '',
          isHovered ? 'ring-2 ring-indigo-400 ring-inset' : '',
        ].filter(Boolean).join(' ')}
        style={{
          backgroundImage: `url(${image.dataUrl})`,
          backgroundSize: bgSize,
          backgroundPosition: bgPos,
        }}
      />
    </div>
  );
}
