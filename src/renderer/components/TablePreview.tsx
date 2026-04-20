// src/renderer/components/TablePreview.tsx

import { useState, useContext, useCallback, useEffect } from 'react';
import { ProjectContext } from '../hooks/useProject';
import { flattenSyllables } from '../lib/sliceUtils';
import { resolveCellState, isWordBoundary } from '../lib/tableUtils';
import { TableCell } from './table-preview/TableCell';
import { ContextMenu } from './table-preview/ContextMenu';
import type { ManuscriptSource, SyllabifiedWord } from '../lib/models';

// ── Layout constants (base values at 100% zoom) ─────────────────────────────
// Phase 08 LPUI-01 (D-03): renamed from *_WIDTH/*_HEIGHT to BASE_* so that the
// component can derive scaled values at runtime via zoomFactor. Values at 100%
// zoom are identical to the pre-zoom constants (D-10, D-11).
const BASE_METADATA_COL_WIDTH = 160;
const BASE_COL_WIDTH = 64;
const BASE_ROW_HEIGHT = 80;
const BASE_ACCENT_ROW_HEIGHT = 24;
const BASE_SYLLABLE_ROW_HEIGHT = 28;
const BASE_META_FONT_SIZE = 14; // px — siglum (text-sm ≈ 14px)
const BASE_SYL_FONT_SIZE = 12;  // px — syllable header text (text-xs ≈ 12px)

// ── LPUI-01: zoom controls (D-03) ───────────────────────────────────────────
// Discrete presets only (no free-form zoom). Reduces layout constants
// proportionally instead of using a CSS scale transform, so that CSS sticky
// positioning continues to work correctly at all zoom levels.
const ZOOM_PRESETS = [50, 75, 100, 125, 150] as const;
type ZoomLevel = typeof ZOOM_PRESETS[number];

// ── Accent heuristic (D-02, Claude's discretion) ─────────────────────────────
// Mark penultimate syllable of words with ≥2 syllables as accented.
function buildAccentedSet(words: SyllabifiedWord[]): Set<number> {
  const accented = new Set<number>();
  let cursor = 0;
  for (const word of words) {
    const n = word.syllables.length;
    if (n >= 2) {
      accented.add(cursor + n - 2); // penultimate
    }
    cursor += n;
  }
  return accented;
}

// ── Screen props (matches App.tsx ScreenProps) ───────────────────────────────
interface ScreenProps {
  onNext: () => void;
  onPrev: () => void;
  canGoNext: boolean;
  canGoPrev: boolean;
  onNavigateToEditor?: (sourceId: string) => void;
}

// ── Context menu state ────────────────────────────────────────────────────────
interface MenuState {
  x: number;
  y: number;
  sourceId: string;
  syllableIdx: number;
}

export function TablePreview({ onNext, onPrev, canGoNext, canGoPrev, onNavigateToEditor }: ScreenProps) {
  const { state, dispatch } = useContext(ProjectContext)!;
  const [menu, setMenu] = useState<MenuState | null>(null);

  // ── LPUI-01: zoom state (session-only, never persisted) ──────────────────
  const [zoom, setZoom] = useState<ZoomLevel>(100);

  // Scaled layout constants — same names used throughout the component body.
  // Using Math.round to avoid sub-pixel widths that blur sticky column borders.
  const zoomFactor = zoom / 100;
  const METADATA_COL_WIDTH = Math.round(BASE_METADATA_COL_WIDTH * zoomFactor);
  const COL_WIDTH = Math.round(BASE_COL_WIDTH * zoomFactor);
  const ROW_HEIGHT = Math.round(BASE_ROW_HEIGHT * zoomFactor);
  const ACCENT_ROW_HEIGHT = Math.round(BASE_ACCENT_ROW_HEIGHT * zoomFactor);
  const SYLLABLE_ROW_HEIGHT = Math.round(BASE_SYLLABLE_ROW_HEIGHT * zoomFactor);
  const metaFontSize = Math.round(BASE_META_FONT_SIZE * zoomFactor);
  const sylFontSize = Math.round(BASE_SYL_FONT_SIZE * zoomFactor);

  // ── Zoom handlers ────────────────────────────────────────────────────────
  const zoomIn = useCallback(() => {
    setZoom(current => {
      const idx = ZOOM_PRESETS.indexOf(current);
      if (idx < 0 || idx === ZOOM_PRESETS.length - 1) return current;
      return ZOOM_PRESETS[idx + 1];
    });
  }, []);
  const zoomOut = useCallback(() => {
    setZoom(current => {
      const idx = ZOOM_PRESETS.indexOf(current);
      if (idx <= 0) return current;
      return ZOOM_PRESETS[idx - 1];
    });
  }, []);
  const zoomReset = useCallback(() => setZoom(100), []);

  // Keyboard shortcuts: Ctrl+=/+ zoom in, Ctrl+- zoom out, Ctrl+0 reset.
  // preventDefault() suppresses Electron's native zoom so the table-level
  // zoom is the one and only zoom the user experiences.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (!e.ctrlKey && !e.metaKey) return;
      if (e.key === '=' || e.key === '+') {
        e.preventDefault();
        zoomIn();
      } else if (e.key === '-') {
        e.preventDefault();
        zoomOut();
      } else if (e.key === '0') {
        e.preventDefault();
        zoomReset();
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [zoomIn, zoomOut, zoomReset]);

  const project = state.project;

  // ── Empty state ─────────────────────────────────────────────────────────────
  if (!project || project.sources.length === 0) {
    return (
      <div className="flex flex-col h-full p-8">
        <h1 className="text-2xl font-bold text-gray-900 mb-2">Tabela Comparativa</h1>
        <p className="text-gray-400 text-sm">Nenhuma fonte adicionada ao projeto.</p>
        <div className="flex-1" />
        <div className="flex justify-between">
          <button
            onClick={onPrev}
            disabled={!canGoPrev}
            className="px-4 py-2 bg-gray-200 text-gray-700 rounded disabled:opacity-40 hover:bg-gray-300"
          >Anterior</button>
          <button
            onClick={onNext}
            disabled={!canGoNext}
            className="px-4 py-2 bg-blue-600 text-white rounded disabled:opacity-40 hover:bg-blue-700"
          >Próximo</button>
        </div>
      </div>
    );
  }

  const syllables = flattenSyllables(project.text.words);
  const totalSyllables = syllables.length;
  const accented = buildAccentedSet(project.text.words);

  // Sources sorted by order
  const sources = [...project.sources].sort((a, b) => a.order - b.order);

  // ── Context menu handlers ────────────────────────────────────────────────────
  const handleCellClick = useCallback((e: React.MouseEvent, sourceId: string, syllableIdx: number) => {
    e.stopPropagation();
    setMenu({ x: e.clientX, y: e.clientY, sourceId, syllableIdx });
  }, []);

  const closeMenu = useCallback(() => setMenu(null), []);

  function getMenuSource(): ManuscriptSource | undefined {
    if (!menu) return undefined;
    return sources.find(s => s.id === menu.sourceId);
  }

  function handleEditInEditor() {
    if (!menu) return;
    onNavigateToEditor?.(menu.sourceId);
  }

  function handleRemoveCrop() {
    if (!menu) return;
    const source = getMenuSource();
    if (!source) return;
    // Remove from syllableCuts and from syllableBoxes on all lines
    const newCuts = { ...source.syllableCuts };
    delete newCuts[menu.syllableIdx];
    const newLines = source.lines.map(line => {
      if (!line.syllableBoxes) return line;
      const boxes = { ...line.syllableBoxes };
      delete boxes[menu.syllableIdx];
      return { ...line, syllableBoxes: boxes };
    });
    dispatch({ type: 'UPDATE_SOURCE', payload: { ...source, syllableCuts: newCuts, lines: newLines } });
  }

  function handleMarkAsGap() {
    if (!menu) return;
    const source = getMenuSource();
    if (!source) return;
    // Find the line covering this syllable and toggle its box to null (explicit gap)
    const newLines = source.lines.map(line => {
      const { start, end } = line.syllableRange;
      if (menu.syllableIdx < start || menu.syllableIdx > end) return line;
      const boxes = { ...(line.syllableBoxes ?? {}) };
      // If currently a gap (null), unmark it (remove key → unfilled)
      if (boxes[menu.syllableIdx] === null) {
        delete boxes[menu.syllableIdx];
      } else {
        boxes[menu.syllableIdx] = null;
      }
      return { ...line, syllableBoxes: boxes };
    });
    // Also update syllableCuts: null = gap
    const newCuts = { ...source.syllableCuts };
    const wasGap = newCuts[menu.syllableIdx] === null;
    if (wasGap) {
      delete newCuts[menu.syllableIdx];
    } else {
      newCuts[menu.syllableIdx] = null;
    }
    dispatch({ type: 'UPDATE_SOURCE', payload: { ...source, lines: newLines, syllableCuts: newCuts } });
  }

  // ── Sticky layout: outer div clips, inner div scrolls ───────────────────────
  // Total table width: metadata col + N syllable cols
  const tableWidth = METADATA_COL_WIDTH + totalSyllables * COL_WIDTH;

  return (
    <div className="flex flex-col h-full">
      {/* ── Top bar ── */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-gray-200 bg-white flex-shrink-0">
        <h1 className="text-lg font-semibold text-gray-900">Tabela Comparativa</h1>
        <div className="flex items-center gap-4">
          {/* LPUI-01: zoom controls (D-03) */}
          <div className="flex items-center gap-1" role="toolbar" aria-label="Controles de zoom da tabela">
            <button
              onClick={zoomOut}
              disabled={zoom === ZOOM_PRESETS[0]}
              className="px-2 py-1 text-sm bg-gray-100 hover:bg-gray-200 disabled:opacity-40 disabled:cursor-not-allowed rounded border border-gray-300"
              title="Diminuir zoom (Ctrl+-)"
              aria-label="Diminuir zoom"
            >−</button>
            <button
              onClick={zoomReset}
              className={`px-2 py-1 text-sm rounded border min-w-[56px] ${
                zoom === 100
                  ? 'bg-blue-100 text-blue-700 border-blue-300 font-medium'
                  : 'bg-gray-100 hover:bg-gray-200 border-gray-300'
              }`}
              title="Restaurar zoom (Ctrl+0)"
              aria-label={`Zoom atual ${zoom}%; clique para voltar a 100%`}
            >{zoom}%</button>
            <button
              onClick={zoomIn}
              disabled={zoom === ZOOM_PRESETS[ZOOM_PRESETS.length - 1]}
              className="px-2 py-1 text-sm bg-gray-100 hover:bg-gray-200 disabled:opacity-40 disabled:cursor-not-allowed rounded border border-gray-300"
              title="Aumentar zoom (Ctrl+=)"
              aria-label="Aumentar zoom"
            >+</button>
          </div>
          {/* Navigation */}
          <div className="flex gap-2">
            <button
              onClick={onPrev}
              disabled={!canGoPrev}
              className="px-3 py-1.5 text-sm bg-gray-200 text-gray-700 rounded disabled:opacity-40 hover:bg-gray-300"
            >Anterior</button>
            <button
              onClick={onNext}
              disabled={!canGoNext}
              className="px-3 py-1.5 text-sm bg-blue-600 text-white rounded disabled:opacity-40 hover:bg-blue-700"
            >Próximo</button>
          </div>
        </div>
      </div>

      {/* ── Scrollable table area ── */}
      <div className="flex-1 overflow-auto">
        <div style={{ width: tableWidth, minWidth: '100%' }}>

          {/* ═══════════════════════════════════════════════════════
              HEADER ROW 1: Accents (D-02)
          ═══════════════════════════════════════════════════════ */}
          <div className="flex sticky top-0 z-20 bg-gray-50 border-b border-gray-300">
            {/* Metadata corner cell */}
            <div
              className="flex-shrink-0 sticky left-0 z-30 bg-gray-50 border-r-2 border-gray-400"
              style={{ width: METADATA_COL_WIDTH, height: ACCENT_ROW_HEIGHT }}
            />
            {/* Accent markers per syllable */}
            {syllables.map((_, idx) => {
              const wb = isWordBoundary(project.text.words, idx);
              return (
                <div
                  key={idx}
                  className="flex-shrink-0 flex items-center justify-center"
                  style={{
                    width: COL_WIDTH,
                    height: ACCENT_ROW_HEIGHT,
                    borderRight: wb ? '2px solid #9ca3af' : '1px solid #e5e7eb',
                  }}
                >
                  {accented.has(idx) && (
                    <span
                      className="text-blue-500 leading-none"
                      style={{ fontSize: sylFontSize }}
                      title="Acento principal"
                    >&#9679;</span>
                  )}
                </div>
              );
            })}
          </div>

          {/* ═══════════════════════════════════════════════════════
              HEADER ROW 2: Syllable text (D-02)
          ═══════════════════════════════════════════════════════ */}
          <div className="flex sticky z-20 bg-white border-b-2 border-gray-400" style={{ top: ACCENT_ROW_HEIGHT }}>
            {/* Metadata col label */}
            <div
              className="flex-shrink-0 sticky left-0 z-30 bg-white border-r-2 border-gray-400 flex items-center px-2"
              style={{ width: METADATA_COL_WIDTH, height: SYLLABLE_ROW_HEIGHT }}
            >
              <span className="text-xs text-gray-500 font-medium uppercase tracking-wide">Fonte</span>
            </div>
            {/* Syllable text cells */}
            {syllables.map((syl, idx) => {
              const wb = isWordBoundary(project.text.words, idx);
              return (
                <div
                  key={idx}
                  className="flex-shrink-0 flex items-center justify-center overflow-hidden"
                  style={{
                    width: COL_WIDTH,
                    height: SYLLABLE_ROW_HEIGHT,
                    borderRight: wb ? '2px solid #9ca3af' : '1px solid #e5e7eb',
                  }}
                >
                  <span
                    className="font-mono text-gray-700 truncate px-0.5 select-none"
                    style={{ fontSize: sylFontSize }}
                    title={syl}
                  >
                    {syl}
                  </span>
                </div>
              );
            })}
          </div>

          {/* ═══════════════════════════════════════════════════════
              DATA ROWS: one per source (D-01, D-04, D-05)
          ═══════════════════════════════════════════════════════ */}
          {sources.map(source => (
            <div key={source.id} className="flex border-b border-gray-200 hover:bg-gray-50/30">

              {/* ── Sticky metadata cell (D-01, D-08) ── */}
              <div
                className="flex-shrink-0 sticky left-0 z-10 bg-white border-r-2 border-gray-400 flex flex-col justify-center px-2 py-1 gap-0.5"
                style={{ width: METADATA_COL_WIDTH, height: ROW_HEIGHT }}
              >
                <span
                  className="font-semibold text-gray-900 truncate"
                  style={{ fontSize: metaFontSize }}
                  title={source.metadata.siglum}
                >
                  {source.metadata.siglum}
                </span>
                <span
                  className="text-gray-500 truncate"
                  style={{ fontSize: sylFontSize }}
                  title={source.metadata.city}
                >
                  {source.metadata.city}
                </span>
                <span
                  className="text-gray-400 truncate"
                  style={{ fontSize: sylFontSize }}
                >
                  {source.metadata.century}
                </span>
                {source.metadata.folio && (
                  <span
                    className="text-gray-400 truncate"
                    style={{ fontSize: sylFontSize }}
                    title={`Fólio ${source.metadata.folio}`}
                  >
                    f. {source.metadata.folio}
                  </span>
                )}
              </div>

              {/* ── Syllable cells ── */}
              {syllables.map((_, idx) => {
                const cellState = resolveCellState(source, idx);
                const wb = isWordBoundary(project.text.words, idx);
                return (
                  <TableCell
                    key={idx}
                    state={cellState}
                    isWordBoundary={wb}
                    colWidthPx={COL_WIDTH}
                    rowHeightPx={ROW_HEIGHT}
                    onClick={e => handleCellClick(e, source.id, idx)}
                  />
                );
              })}
            </div>
          ))}
        </div>
      </div>

      {/* ── Context menu (D-06) ── */}
      {menu && (() => {
        const src = getMenuSource();
        if (!src) return null;
        const cellState = resolveCellState(src, menu.syllableIdx);
        return (
          <ContextMenu
            x={menu.x}
            y={menu.y}
            hasCrop={cellState.kind === 'filled'}
            isGap={cellState.kind === 'gap'}
            onEditInEditor={handleEditInEditor}
            onRemoveCrop={handleRemoveCrop}
            onMarkAsGap={handleMarkAsGap}
            onClose={closeMenu}
          />
        );
      })()}
    </div>
  );
}
