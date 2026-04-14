// src/renderer/components/slice-editor/ImageCanvas.tsx

import React, { useEffect, useRef } from 'react';
import { StoredImage } from '../../lib/models';
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
}: ImageCanvasProps) {
  // Refs
  const containerRef = useRef<HTMLDivElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  const dividerRefs = useRef<number[]>([]);
  const isPanning = useRef(false);
  const startPanRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });

  // Sync dividerRefs with prop
  useEffect(() => {
    dividerRefs.current = [...dividers];
  }, [dividers]);

  // ── Event handlers ──────────────────────────────────────────────────────────

  function handleWheel(e: React.WheelEvent<HTMLDivElement>) {
    e.preventDefault();
    const delta = -e.deltaY * 0.001;
    const newZoom = Math.max(0.25, Math.min(8, zoom * (1 + delta)));
    const rect = containerRef.current!.getBoundingClientRect();
    const cursorX = e.clientX - rect.left;
    const cursorY = e.clientY - rect.top;
    const scaleRatio = newZoom / zoom;
    const newPanX = cursorX / zoom - scaleRatio * (cursorX / zoom - panOffset.x);
    const newPanY = cursorY / zoom - scaleRatio * (cursorY / zoom - panOffset.y);
    dispatch({ type: 'SET_ZOOM', payload: newZoom });
    dispatch({ type: 'SET_PAN', payload: { x: newPanX, y: newPanY } });
  }

  function handleCanvasPointerDown(e: React.PointerEvent<HTMLDivElement>) {
    if (e.ctrlKey || e.shiftKey) {
      e.preventDefault();
      isPanning.current = true;
      startPanRef.current = {
        x: e.clientX / zoom - panOffset.x,
        y: e.clientY / zoom - panOffset.y,
      };
      containerRef.current?.setPointerCapture(e.pointerId);
    }
  }

  function handleCanvasPointerMove(e: React.PointerEvent<HTMLDivElement>) {
    if (!isPanning.current) return;
    const newPanX = e.clientX / zoom - startPanRef.current.x;
    const newPanY = e.clientY / zoom - startPanRef.current.y;
    dispatch({ type: 'SET_PAN', payload: { x: newPanX, y: newPanY } });
  }

  function handleCanvasPointerUp(e: React.PointerEvent<HTMLDivElement>) {
    if (isPanning.current) {
      isPanning.current = false;
      containerRef.current?.releasePointerCapture(e.pointerId);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    if (e.key === '0' && e.ctrlKey) {
      e.preventDefault();
      dispatch({ type: 'SET_ZOOM', payload: 1 });
      dispatch({ type: 'SET_PAN', payload: { x: 0, y: 0 } });
    }
  }

  function handleDividerCommit(index: number, newFraction: number) {
    const updated = [...dividerRefs.current];
    updated[index] = newFraction;
    dispatch({ type: 'SET_DIVIDERS', payload: updated });
  }

  function renderSliceHighlight() {
    if (hoveredSyllableIdx === null || !syllableRange) return null;

    // Gap-guard: gap syllables have no corresponding slice — render nothing.
    const gapSet = new Set(gaps);
    if (gapSet.has(hoveredSyllableIdx)) return null;

    // Find which slice index this global syllable maps to.
    // Active syllables: range indices excluding gaps.
    let sliceIdx = 0;
    for (let i = syllableRange.start; i <= syllableRange.end; i++) {
      if (gapSet.has(i)) continue;
      if (i === hoveredSyllableIdx) break;
      sliceIdx++;
    }

    // sliceIdx is now the 0-based index in active syllables
    const boundaries = [0, ...dividers, 1];
    const leftFrac = boundaries[sliceIdx] ?? 0;
    const rightFrac = boundaries[sliceIdx + 1] ?? 1;

    return (
      <div
        className="absolute top-0 bottom-0 bg-red-400/20 pointer-events-none"
        style={{
          left: `${leftFrac * 100}%`,
          width: `${(rightFrac - leftFrac) * 100}%`,
        }}
      />
    );
  }

  // ── Render ──────────────────────────────────────────────────────────────────

  if (!image) {
    return (
      <div className="flex items-center justify-center h-full text-gray-400">
        Nenhuma imagem carregada
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className="relative w-full h-full overflow-hidden bg-gray-100 focus:outline-none"
      tabIndex={0}
      onWheel={handleWheel}
      onPointerDown={handleCanvasPointerDown}
      onPointerMove={handleCanvasPointerMove}
      onPointerUp={handleCanvasPointerUp}
      onKeyDown={handleKeyDown}
    >
      {/* Inner container receives CSS transform for zoom/pan */}
      <div
        ref={overlayRef}
        className="absolute inset-0 origin-top-left"
        style={{
          transform: `scale(${zoom}) translate(${panOffset.x}px, ${panOffset.y}px)`,
        }}
      >
        <img
          src={image.dataUrl}
          alt="Manuscript"
          className="block max-w-none select-none pointer-events-none"
          style={{ width: image.width, height: image.height }}
          draggable={false}
        />

        {/* Divider handles */}
        {dividers.map((frac, idx) => (
          <DividerHandle
            key={idx}
            index={idx}
            initialFraction={frac}
            containerRef={overlayRef}
            dividerRefs={dividerRefs}
            syllableCount={dividers.length + 1}
            onCommit={handleDividerCommit}
            onHover={() => {}}
          />
        ))}

        {/* Slice highlight overlay for hovered syllable */}
        {hoveredSyllableIdx !== null && image && renderSliceHighlight()}
      </div>
    </div>
  );
}
