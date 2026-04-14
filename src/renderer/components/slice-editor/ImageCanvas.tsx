// src/renderer/components/slice-editor/ImageCanvas.tsx

import React, { useRef } from 'react';
import { StoredImage, SyllabifiedWord } from '../../lib/models';
import { EditorAction } from './editorReducer';
import { DividerHandle } from './DividerHandle';

interface ImageCanvasProps {
  image: StoredImage | null;
  dividers: number[];           // fractions 0.0–1.0
  syllableRange: { start: number; end: number } | null;
  gaps: number[];
  hoveredSyllableIdx: number | null;
  zoom: number;
  panOffset: { x: number; y: number };
  dispatch: React.Dispatch<EditorAction>;
  words?: SyllabifiedWord[];
}

export function ImageCanvas({
  image,
  dividers,
  syllableRange,
  gaps,
  hoveredSyllableIdx,
  zoom,
  panOffset,
  dispatch,
  words,
}: ImageCanvasProps) {
  const imageWrapperRef = useRef<HTMLDivElement>(null);
  const dividerRefs = useRef<number[]>([...dividers]);

  // Keep dividerRefs in sync with prop (after AUTO_DISTRIBUTE, SET_DIVIDERS)
  if (dividerRefs.current.length !== dividers.length) {
    dividerRefs.current = [...dividers];
  }

  // ── Compute syllable labels ────────────────────────────────────────────────
  function computeSliceLabels(): Array<{ text: string; isLastOfWord: boolean; globalIdx: number }> {
    if (!words || !syllableRange) return [];
    const gapSet = new Set(gaps);
    const labels: Array<{ text: string; isLastOfWord: boolean; globalIdx: number }> = [];
    let globalIdx = 0;
    for (let wi = 0; wi < words.length; wi++) {
      const word = words[wi];
      for (let si = 0; si < word.syllables.length; si++) {
        if (
          globalIdx >= syllableRange.start &&
          globalIdx <= syllableRange.end &&
          !gapSet.has(globalIdx)
        ) {
          const isLast = si === word.syllables.length - 1;
          labels.push({
            text: isLast ? word.syllables[si] : word.syllables[si] + '-',
            isLastOfWord: isLast,
            globalIdx,
          });
        }
        globalIdx++;
      }
    }
    return labels;
  }

  function handleWheel(e: React.WheelEvent<HTMLDivElement>) {
    e.preventDefault();
    const delta = -e.deltaY * 0.001;
    const newZoom = Math.max(0.5, Math.min(4, zoom * (1 + delta)));
    dispatch({ type: 'SET_ZOOM', payload: newZoom });
  }

  function handleDividerCommit(index: number, newFraction: number) {
    const updated = [...dividerRefs.current];
    updated[index] = newFraction;
    dispatch({ type: 'SET_DIVIDERS', payload: updated });
  }

  if (!image) {
    return (
      <div className="flex items-center justify-center h-full text-gray-400">
        Nenhuma imagem carregada
      </div>
    );
  }

  const sliceLabels = computeSliceLabels();
  const boundaries = [0, ...dividers, 1];

  return (
    <div className="flex flex-col h-full bg-gray-100" onWheel={handleWheel}>
      {/* Labels row — always visible above image, aligned with slices below */}
      <div className="h-8 bg-white border-b border-gray-300 flex-shrink-0 overflow-hidden">
        <div
          className="relative h-full"
          style={{ width: `${100 * zoom}%`, minWidth: '100%' }}
        >
          {sliceLabels.map((label, i) => {
            const leftFrac = boundaries[i] ?? 0;
            const rightFrac = boundaries[i + 1] ?? 1;
            const isHovered =
              hoveredSyllableIdx !== null && label.globalIdx === hoveredSyllableIdx;
            return (
              <div
                key={i}
                className={[
                  'absolute top-0 bottom-0 flex items-center justify-center text-sm font-medium truncate px-1 cursor-pointer',
                  label.isLastOfWord
                    ? 'border-r-2 border-gray-700'
                    : 'border-r border-gray-300',
                  isHovered
                    ? 'bg-yellow-200 text-yellow-900'
                    : 'text-gray-800 hover:bg-gray-50',
                ].join(' ')}
                style={{
                  left: `${leftFrac * 100}%`,
                  width: `${(rightFrac - leftFrac) * 100}%`,
                }}
                onMouseEnter={() =>
                  dispatch({ type: 'SET_HOVER', payload: label.globalIdx })
                }
                onMouseLeave={() => dispatch({ type: 'SET_HOVER', payload: null })}
              >
                {label.text}
              </div>
            );
          })}
        </div>
      </div>

      {/* Image + dividers area */}
      <div className="relative flex-1 min-h-0 overflow-auto">
        {/* Inner wrapper sized to fit width; dividers positioned relative to this */}
        <div
          ref={imageWrapperRef}
          className="relative inline-block"
          style={{
            width: `${100 * zoom}%`,
            minWidth: '100%',
            transform: `translate(${panOffset.x}px, ${panOffset.y}px)`,
          }}
        >
          <img
            src={image.dataUrl}
            alt="Manuscript"
            className="block w-full h-auto select-none pointer-events-none"
            draggable={false}
          />

          {/* Divider handles — absolute over the image */}
          {dividers.map((frac, idx) => (
            <DividerHandle
              key={idx}
              index={idx}
              initialFraction={frac}
              containerRef={imageWrapperRef}
              dividerRefs={dividerRefs}
              syllableCount={dividers.length + 1}
              onCommit={handleDividerCommit}
              onHover={() => {}}
            />
          ))}

          {/* Slice highlight overlay */}
          {hoveredSyllableIdx !== null &&
            syllableRange &&
            (() => {
              const gapSet = new Set(gaps);
              if (gapSet.has(hoveredSyllableIdx)) return null;
              let sliceIdx = 0;
              for (let i = syllableRange.start; i <= syllableRange.end; i++) {
                if (gapSet.has(i)) continue;
                if (i === hoveredSyllableIdx) break;
                sliceIdx++;
              }
              const leftFrac = boundaries[sliceIdx] ?? 0;
              const rightFrac = boundaries[sliceIdx + 1] ?? 1;
              return (
                <div
                  className="absolute top-0 bottom-0 bg-yellow-400/20 pointer-events-none border-x-2 border-yellow-500/50"
                  style={{
                    left: `${leftFrac * 100}%`,
                    width: `${(rightFrac - leftFrac) * 100}%`,
                  }}
                />
              );
            })()}
        </div>
      </div>
    </div>
  );
}
