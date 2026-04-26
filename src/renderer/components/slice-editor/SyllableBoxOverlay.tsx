// src/renderer/components/slice-editor/SyllableBoxOverlay.tsx
//
// Renders a single selected bounding box with 8 resize handles.
// Handles pointer-based drag-to-move and drag-to-resize, plus keyboard nudge/delete.
// All coordinates are fractions of the container dimensions (0.0–1.0).

import React, { useRef } from 'react';
import { SyllableBox } from '../../lib/models';

// ── Handle types ─────────────────────────────────────────────────────────────

type HandleId = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w';

// ── Props ─────────────────────────────────────────────────────────────────────

interface SyllableBoxOverlayProps {
  box: SyllableBox;
  containerRef: React.RefObject<HTMLDivElement | null>; // the image wrapper div
  onBoxChange: (newBox: SyllableBox) => void;           // called on every pointermove (live feedback)
  onBoxCommit: (newBox: SyllableBox) => void;           // called on pointerup (dispatch to reducer)
  onDeleteBox: () => void;                              // called on Delete/Backspace keydown
}

// ── Drag state type ───────────────────────────────────────────────────────────

type DragState = {
  type: 'body' | 'handle';
  handleId?: HandleId;
  startBox: SyllableBox;
  startClientX: number;
  startClientY: number;
};

// ── Handle configuration ──────────────────────────────────────────────────────

interface HandleConfig {
  id: HandleId;
  left: string;
  top: string;
  cursor: string;
}

const HANDLES: HandleConfig[] = [
  { id: 'nw', left: '-4px',      top: '-4px',      cursor: 'nwse-resize' },
  { id: 'n',  left: 'calc(50% - 4px)', top: '-4px', cursor: 'ns-resize'   },
  { id: 'ne', left: 'calc(100% - 4px)', top: '-4px', cursor: 'nesw-resize' },
  { id: 'e',  left: 'calc(100% - 4px)', top: 'calc(50% - 4px)', cursor: 'ew-resize'   },
  { id: 'se', left: 'calc(100% - 4px)', top: 'calc(100% - 4px)', cursor: 'nwse-resize' },
  { id: 's',  left: 'calc(50% - 4px)', top: 'calc(100% - 4px)', cursor: 'ns-resize'   },
  { id: 'sw', left: '-4px',      top: 'calc(100% - 4px)', cursor: 'nesw-resize' },
  { id: 'w',  left: '-4px',      top: 'calc(50% - 4px)', cursor: 'ew-resize'   },
];

// ── Clamp helper ──────────────────────────────────────────────────────────────

function clampBox(box: SyllableBox): SyllableBox {
  const w = Math.max(0.005, box.w);
  const h = Math.max(0.005, box.h);
  const x = Math.max(0, Math.min(1 - w, box.x));
  const y = Math.max(0, Math.min(1 - h, box.y));
  return { x, y, w, h };
}

// ── Apply resize delta for a given handle ────────────────────────────────────

function applyHandleDelta(
  startBox: SyllableBox,
  handleId: HandleId,
  dx: number,
  dy: number,
): SyllableBox {
  let { x, y, w, h } = startBox;

  switch (handleId) {
    case 'nw': x += dx; y += dy; w -= dx; h -= dy; break;
    case 'n':  y += dy; h -= dy; break;
    case 'ne': w += dx; y += dy; h -= dy; break;
    case 'e':  w += dx; break;
    case 'se': w += dx; h += dy; break;
    case 's':  h += dy; break;
    case 'sw': x += dx; w -= dx; h += dy; break;
    case 'w':  x += dx; w -= dx; break;
  }

  return clampBox({ x, y, w, h });
}

// ── Pixel-delta → canonical-fraction-delta helper (Phase 11 / IMG-07) ─────────

// ── Component ─────────────────────────────────────────────────────────────────

export function SyllableBoxOverlay({
  box,
  containerRef,
  onBoxChange,
  onBoxCommit,
  onDeleteBox,
}: SyllableBoxOverlayProps) {
  const dragState = useRef<DragState | null>(null);

  // ── Pointer events on the outer div (body drag + handle move relay) ────────

  function onOuterPointerDown(e: React.PointerEvent<HTMLDivElement>) {
    // Only respond to direct clicks on the box body (not on handles)
    if (e.target !== e.currentTarget) return;

    e.preventDefault();
    e.stopPropagation();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);

    dragState.current = {
      type: 'body',
      startBox: { ...box },
      startClientX: e.clientX,
      startClientY: e.clientY,
    };
  }

  function onOuterPointerMove(e: React.PointerEvent<HTMLDivElement>) {
    const state = dragState.current;
    if (!state) return;
    if (!(e.currentTarget as HTMLElement).hasPointerCapture(e.pointerId)) return;

    const container = containerRef.current;
    if (!container) return;

    const offW = container.offsetWidth;
    const offH = container.offsetHeight;
    const dx = (e.clientX - state.startClientX) / offW;
    const dy = (e.clientY - state.startClientY) / offH;

    let newBox: SyllableBox;

    if (state.type === 'body') {
      const { startBox } = state;
      newBox = clampBox({
        x: startBox.x + dx,
        y: startBox.y + dy,
        w: startBox.w,
        h: startBox.h,
      });
    } else {
      // handle drag
      newBox = applyHandleDelta(state.startBox, state.handleId!, dx, dy);
    }

    onBoxChange(newBox);
  }

  function onOuterPointerUp(e: React.PointerEvent<HTMLDivElement>) {
    const state = dragState.current;
    if (!state) return;

    (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);

    const container = containerRef.current;
    if (!container) {
      dragState.current = null;
      return;
    }

    const offW = container.offsetWidth;
    const offH = container.offsetHeight;
    const dx = (e.clientX - state.startClientX) / offW;
    const dy = (e.clientY - state.startClientY) / offH;

    let finalBox: SyllableBox;

    if (state.type === 'body') {
      const { startBox } = state;
      finalBox = clampBox({
        x: startBox.x + dx,
        y: startBox.y + dy,
        w: startBox.w,
        h: startBox.h,
      });
    } else {
      finalBox = applyHandleDelta(state.startBox, state.handleId!, dx, dy);
    }

    dragState.current = null;
    onBoxCommit(finalBox);
  }

  // ── Pointer events on individual handles ──────────────────────────────────

  function onHandlePointerDown(e: React.PointerEvent<HTMLDivElement>, handleId: HandleId) {
    e.preventDefault();
    e.stopPropagation();

    // Transfer pointer capture to the outer div so its pointermove/pointerup handlers fire
    const outer = e.currentTarget.closest('[data-box-overlay]') as HTMLElement | null;
    if (outer) {
      outer.setPointerCapture(e.pointerId);
    }

    dragState.current = {
      type: 'handle',
      handleId,
      startBox: { ...box },
      startClientX: e.clientX,
      startClientY: e.clientY,
    };
  }

  // ── Keyboard handling ──────────────────────────────────────────────────────

  function onKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    if (e.key === 'Delete' || e.key === 'Backspace') {
      e.preventDefault();
      onDeleteBox();
      return;
    }

    const arrowKeys = ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'];
    if (!arrowKeys.includes(e.key)) return;

    e.preventDefault();

    const container = containerRef.current;
    if (!container) return;

    const offW = container.offsetWidth;
    const offH = container.offsetHeight;
    const pixels = e.shiftKey ? 10 : 1;
    let dxPx = 0;
    let dyPx = 0;
    switch (e.key) {
      case 'ArrowLeft':  dxPx = -pixels; break;
      case 'ArrowRight': dxPx = +pixels; break;
      case 'ArrowUp':    dyPx = -pixels; break;
      case 'ArrowDown':  dyPx = +pixels; break;
    }
    const dxFrac = dxPx / offW;
    const dyFrac = dyPx / offH;

    let { x, y, w, h } = box;
    x += dxFrac;
    y += dyFrac;

    const newBox = clampBox({ x, y, w, h });
    onBoxCommit(newBox);
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div
      data-box-overlay
      className="outline outline-2 outline-blue-500 bg-blue-400/15 select-none touch-none absolute"
      style={{
        left:   `${box.x * 100}%`,
        top:    `${box.y * 100}%`,
        width:  `${box.w * 100}%`,
        height: `${box.h * 100}%`,
      }}
      onPointerDown={onOuterPointerDown}
      onPointerMove={onOuterPointerMove}
      onPointerUp={onOuterPointerUp}
      onKeyDown={onKeyDown}
    >
      {HANDLES.map((h) => (
        <div
          key={h.id}
          className="absolute w-2 h-2 bg-white border border-blue-500 shadow-sm"
          style={{
            left:   h.left,
            top:    h.top,
            cursor: h.cursor,
          }}
          onPointerDown={(e) => onHandlePointerDown(e, h.id)}
        />
      ))}
    </div>
  );
}
