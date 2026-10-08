// src/renderer/components/table-preview/TableCell.tsx

import { useState, useRef } from 'react';
import type { CellState } from '../../lib/tableUtils';
import type { ImageAdjustments } from '../../lib/models';
import { buildImageFilter, buildImageTransform, normalizeRotation } from '../../lib/image-adjustments';
import { useTranslation } from 'react-i18next';
import { Plus } from 'lucide-react';

/** Where a menu opened from the cell goes, and the cell to refocus when it closes. */
export interface CellAnchor {
  x: number;
  y: number;
  cell: HTMLElement;
}

/** Keyboard anchor: below the cell's left edge. */
function anchorBelow(cell: HTMLElement): CellAnchor {
  const r = cell.getBoundingClientRect();
  return { x: r.left, y: r.bottom, cell };
}

export interface TableCellProps {
  state: CellState;
  /** First syllable of a word (not the first of the text): left border rule-strong, else rule-soft. */
  startsWord: boolean;
  /** Identifies the cell in tests: `cell-{sourceId}-{syllable}`. */
  testId?: string;
  /** Column width in pixels — cells are uniform (D-11). */
  colWidthPx: number;
  /** Row height in pixels — uniform (D-10). */
  rowHeightPx: number;
  /** Accessible name: "Recortar <sílaba> em <sigla>" (pending) or the cell actions. */
  ariaLabel?: string;
  /** Click, Enter or Space: pending goes to Recortes, otherwise opens the menu (D-06). */
  onActivate: (anchor: CellAnchor) => void;
  /** Right click, the ContextMenu key or Shift+F10: opens the menu. */
  onOpenMenu: (anchor: CellAnchor) => void;
  /** Ajustes visuais da linha de origem do recorte (Phase 10 / IMG-06; expandido em Phase 11 / IMG-07).
   *  Undefined/default → célula renderiza sem filter/transform (idêntico a v0.0.3).
   *
   *  Phase 11: o `transform` (rotation + flip) é aplicado no DIV viewport
   *  da célula (`<div class="w-full h-full overflow-hidden relative">`), não
   *  mais no <img> interno. Isso faz a imagem (já em escala 100/box.w%)
   *  rotacionar como uma UNIDADE em torno do centro do viewport, em vez de
   *  rotacionar em torno do centro da imagem ampliada (que deslocava o
   *  conteúdo visível para fora do clip). O `filter` (cor) continua no
   *  <img> — só transform muda de lugar.
   *  Para ângulos não-cardinais o conteúdo entra/sai do `overflow: hidden`
   *  conforme esperado ("ver o recorte rotacionado").
   */
  adjustments?: ImageAdjustments;
}

export function TableCell({
  state,
  startsWord,
  testId,
  colWidthPx,
  rowHeightPx,
  ariaLabel,
  onActivate,
  onOpenMenu,
  adjustments,
}: TableCellProps) {
  const { t } = useTranslation();
  const imgFilter = buildImageFilter(adjustments);
  const imgTransform = buildImageTransform(adjustments);
  const [showTooltip, setShowTooltip] = useState(false);
  const cellRef = useRef<HTMLDivElement>(null);

  // Phase 12 (UX revisão): box vive em fração do AABB do retângulo da imagem
  // ROTACIONADA. Para mostrar a região do box ocupando toda a célula:
  //  1. Um div interno (AABB-div) com tamanho = 100/box.w × 100/box.h da célula,
  //     deslocado por -box.x, -box.y.
  //  2. Dentro dele, a `<img>` é centralizada e escalada para que seu AABB
  //     rotacionado coincida com o AABB-div. Rotation/flip via CSS transform.
  const rot = adjustments?.rotation ?? 0;
  const θ = (normalizeRotation(rot) * Math.PI) / 180;
  const absCos = Math.abs(Math.cos(θ));
  const absSin = Math.abs(Math.sin(θ));
  const imgRatio = state.kind === 'filled' && state.image
    ? state.image.height / state.image.width
    : 1;
  const imgWidthPct = 100 / (absCos + imgRatio * absSin);
  const imgHeightPct = (100 * imgRatio) / (absSin + imgRatio * absCos);

  // Sanity check for filled state: reject invalid boxes and missing image
  const filledOk =
    state.kind === 'filled' &&
    !!state.image &&
    !!state.image.dataUrl &&
    state.image.dataUrl.startsWith('data:') &&
    state.box.w > 0 &&
    state.box.h > 0;

  const pending = state.kind === 'unfilled';

  return (
    <div
      ref={cellRef}
      data-testid={testId}
      className={[
        'group relative flex-shrink-0 flex items-center justify-center cursor-pointer select-none border-l border-b border-rule-soft focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-focus',
        // Fronteira de palavra: borda esquerda rule-strong; dentro da palavra, rule-soft.
        startsWord ? 'border-l-rule-strong' : '',
        pending ? 'bg-parchment hover:bg-rubric-wash' : '',
      ].join(' ')}
      style={{
        width: colWidthPx,
        height: rowHeightPx,
      }}
      role="button"
      tabIndex={0}
      aria-label={ariaLabel}
      aria-haspopup={state.kind === 'unfilled' ? undefined : 'menu'}
      onClick={(e) => {
        e.stopPropagation();
        onActivate({ x: e.clientX, y: e.clientY, cell: e.currentTarget });
      }}
      onContextMenu={(e) => {
        e.preventDefault();
        e.stopPropagation();
        onOpenMenu({ x: e.clientX, y: e.clientY, cell: e.currentTarget });
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onActivate(anchorBelow(e.currentTarget));
        } else if (e.key === 'ContextMenu' || (e.key === 'F10' && e.shiftKey)) {
          e.preventDefault();
          onOpenMenu(anchorBelow(e.currentTarget));
        }
      }}
      onMouseEnter={() => state.kind === 'filled' && setShowTooltip(true)}
      onMouseLeave={() => setShowTooltip(false)}
      title={
        state.kind === 'gap'      ? t('tableCell.noNeume') :
        state.kind === 'unfilled' ? t('tableCell.pendingCrop') : undefined
      }
    >
      {/* ── Filled: AABB-div escalado contendo `<img>` rotacionada ── */}
      {state.kind === 'filled' && filledOk && (
        <div className="w-full h-full overflow-hidden relative">
          <div
            className="absolute"
            style={{
              width: `${100 / state.box.w}%`,
              height: `${100 / state.box.h}%`,
              left: `${(-state.box.x / state.box.w) * 100}%`,
              top: `${(-state.box.y / state.box.h) * 100}%`,
            }}
          >
            <img
              src={state.image.dataUrl}
              alt=""
              draggable={false}
              className="absolute pointer-events-none"
              style={{
                left: '50%',
                top: '50%',
                width: `${imgWidthPct}%`,
                height: `${imgHeightPct}%`,
                maxWidth: 'none',
                transform: `translate(-50%, -50%) ${imgTransform ?? ''}`.trim(),
                transformOrigin: 'center center',
                filter: imgFilter || undefined,
              }}
            />
          </div>
        </div>
      )}
      {/* Fallback when filled state is malformed — show error indicator */}
      {state.kind === 'filled' && !filledOk && (
        <span className="text-warning text-xs">?</span>
      )}

      {/* ── Gap: em dash in gray (D-04) ── */}
      {state.kind === 'gap' && (
        <span className="text-ink-muted text-sm font-medium select-none">—</span>
      )}

      {/* ── Pendente: fundo parchment; no hover, rubric-wash e "+" em rubric ── */}
      {pending && (
        <Plus aria-hidden="true" strokeWidth={1.75} className="size-4 text-rubric opacity-0 group-hover:opacity-100" />
      )}

      {/* ── Hover tooltip: enlarged crop (D-07) — viewport-clamped via position:fixed ── */}
      {showTooltip && state.kind === 'filled' && filledOk && cellRef.current && (() => {
        const TW = 240;
        const TH = 180;
        const rect = cellRef.current.getBoundingClientRect();
        const vw = window.innerWidth;
        const vh = window.innerHeight;
        // Horizontal: center on cell, then clamp to viewport
        let left = rect.left + rect.width / 2 - TW / 2;
        left = Math.max(4, Math.min(vw - TW - 4, left));
        // Vertical: prefer below if there's room, else above
        const spaceBelow = vh - rect.bottom;
        const spaceAbove = rect.top;
        const top = spaceBelow >= TH + 8
          ? rect.bottom + 8
          : spaceAbove >= TH + 8
            ? rect.top - TH - 8
            : Math.max(4, vh - TH - 4);
        return (
          <div
            className="fixed z-50 rounded shadow-lg border border-rule-soft bg-surface p-1 pointer-events-none"
            style={{ width: TW, height: TH, left, top }}
          >
            <div className="w-full h-full overflow-hidden relative">
              <div
                className="absolute"
                style={{
                  width: `${100 / state.box.w}%`,
                  height: `${100 / state.box.h}%`,
                  left: `${(-state.box.x / state.box.w) * 100}%`,
                  top: `${(-state.box.y / state.box.h) * 100}%`,
                }}
              >
                <img
                  src={state.image.dataUrl}
                  alt=""
                  className="absolute"
                  style={{
                    left: '50%',
                    top: '50%',
                    width: `${imgWidthPct}%`,
                    height: `${imgHeightPct}%`,
                    maxWidth: 'none',
                    transform: `translate(-50%, -50%) ${imgTransform ?? ''}`.trim(),
                    transformOrigin: 'center center',
                    filter: imgFilter || undefined,
                  }}
                />
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}
