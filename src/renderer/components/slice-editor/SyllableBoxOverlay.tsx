// src/renderer/components/slice-editor/SyllableBoxOverlay.tsx
//
// Renders a single selected bounding box with 8 resize handles.
// Handles pointer-based drag-to-move and drag-to-resize. While dragging only
// onBoxChange fires (a local draft); the project is written once, on
// onBoxCommit (spec D6). Delete and the arrow nudge are window shortcuts of the
// Recortes view (one path, with the per-box nudge coalescing), not of this box.
// All coordinates are fractions of the container dimensions (0.0–1.0).

import React, { useRef } from 'react';
import { SyllableBox } from '../../lib/models';
import { pigmentOf } from '../../ui/pigment';

// ── Handle types ─────────────────────────────────────────────────────────────

type HandleId = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w';

// ── Props ─────────────────────────────────────────────────────────────────────

interface SyllableBoxOverlayProps {
  box: SyllableBox;
  syllableIdx: number;                                  // índice global da sílaba (pigmento)
  label?: string;                                       // texto da sílaba na etiqueta
  containerRef: React.RefObject<HTMLDivElement | null>; // the image wrapper div
  onBoxChange: (newBox: SyllableBox) => void;           // every pointermove: the draft, kept by the canvas
  onBoxCommit: (newBox: SyllableBox) => void;           // end of the gesture (pointerup): written to the project
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
  cursor: string;
}

const HANDLES: HandleConfig[] = [
  { id: 'nw', cursor: 'nwse-resize' },
  { id: 'n',  cursor: 'ns-resize'   },
  { id: 'ne', cursor: 'nesw-resize' },
  { id: 'e',  cursor: 'ew-resize'   },
  { id: 'se', cursor: 'nwse-resize' },
  { id: 's',  cursor: 'ns-resize'   },
  { id: 'sw', cursor: 'nesw-resize' },
  { id: 'w',  cursor: 'ew-resize'   },
];

export type CropBoxState = 'confirmed' | 'active' | 'suggested';

/** Classes da caixa de recorte: pigmento pela sílaba; ativa em rubrica; sugerida tracejada. */
export function cropBoxClass(state: CropBoxState, syllableIdx: number): string {
  return [
    'sc-box',
    pigmentOf(syllableIdx),
    state === 'active' ? 'sc-box--active' : '',
    state === 'suggested' ? 'sc-box--suggested' : '',
  ]
    .filter(Boolean)
    .join(' ');
}

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
  syllableIdx,
  label,
  containerRef,
  onBoxChange,
  onBoxCommit,
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

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div
      data-box-overlay
      className={`${cropBoxClass('active', syllableIdx)} select-none touch-none`}
      style={{
        left:   `${box.x * 100}%`,
        top:    `${box.y * 100}%`,
        width:  `${box.w * 100}%`,
        height: `${box.h * 100}%`,
      }}
      onPointerDown={onOuterPointerDown}
      onPointerMove={onOuterPointerMove}
      onPointerUp={onOuterPointerUp}
    >
      {label && <span className="sc-box__tag pointer-events-none">{label}</span>}
      {HANDLES.map((h) => (
        <div
          key={h.id}
          data-handle={h.id}
          className={`sc-box__h sc-box__h--${h.id}`}
          style={{ cursor: h.cursor }}
          onPointerDown={(e) => onHandlePointerDown(e, h.id)}
        />
      ))}
    </div>
  );
}
