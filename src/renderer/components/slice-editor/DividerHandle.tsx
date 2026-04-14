// src/renderer/components/slice-editor/DividerHandle.tsx

import React, { useEffect, useState } from 'react';

interface DividerHandleProps {
  index: number;              // 0-based divider index
  initialFraction: number;    // 0.0–1.0 position at mount time
  containerRef: React.RefObject<HTMLDivElement | null>;  // the image overlay div
  dividerRefs: React.MutableRefObject<number[]>;         // shared in-flight positions array
  syllableCount: number;      // total active syllables (for MIN_FRACTION)
  onCommit: (index: number, newFraction: number) => void; // called on pointerup
  onHover: (index: number | null) => void;
}

export function DividerHandle({
  index,
  initialFraction,
  containerRef,
  dividerRefs,
  syllableCount,
  onCommit,
  onHover,
}: DividerHandleProps) {
  const [isDragging, setIsDragging] = useState(false);

  // Sync CSS custom property when initialFraction changes (e.g. after AUTO_DISTRIBUTE)
  useEffect(() => {
    containerRef.current?.style.setProperty(`--div-${index}`, `${initialFraction * 100}%`);
    dividerRefs.current[index] = initialFraction;
  }, [initialFraction, index, containerRef, dividerRefs]);

  function onPointerDown(e: React.PointerEvent<HTMLDivElement>) {
    e.preventDefault();
    e.stopPropagation();
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    setIsDragging(true);
  }

  function onPointerMove(e: React.PointerEvent<HTMLDivElement>) {
    if (!(e.target as HTMLElement).hasPointerCapture(e.pointerId)) return;

    const rect = containerRef.current!.getBoundingClientRect();
    let newFrac = (e.clientX - rect.left) / rect.width;

    const MIN_FRAC = 1 / (syllableCount * 10);
    const prevBound = index > 0 ? dividerRefs.current[index - 1] : 0;
    const nextBound = index < dividerRefs.current.length - 1 ? dividerRefs.current[index + 1] : 1;
    newFrac = Math.max(prevBound + MIN_FRAC, Math.min(nextBound - MIN_FRAC, newFrac));

    dividerRefs.current[index] = newFrac;
    containerRef.current!.style.setProperty(`--div-${index}`, `${newFrac * 100}%`);
  }

  function onPointerUp(e: React.PointerEvent<HTMLDivElement>) {
    (e.target as HTMLElement).releasePointerCapture(e.pointerId);
    setIsDragging(false);
    onCommit(index, dividerRefs.current[index]);
  }

  return (
    <div
      className={`absolute top-0 bottom-0 w-0.5 bg-red-500 cursor-col-resize select-none touch-none${isDragging ? ' ring-2 ring-red-300' : ''}`}
      style={{ left: `var(--div-${index})` }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onMouseEnter={() => onHover(index)}
      onMouseLeave={() => onHover(null)}
    >
      {/* Circular handle at top, centered on the line */}
      <div className="absolute -top-2 -left-2 w-4 h-4 bg-red-500 rounded-full border-2 border-white shadow cursor-col-resize" />
    </div>
  );
}
