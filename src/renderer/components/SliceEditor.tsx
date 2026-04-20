// src/renderer/components/SliceEditor.tsx

import { useReducer, useEffect, useState, useRef } from 'react';
import { useProject } from '../hooks/useProject';
import { editorReducer, initialEditorState } from './slice-editor/editorReducer';
import { SourceSidebar } from './slice-editor/SourceSidebar';
import { LineSidebar } from './slice-editor/LineSidebar';
import { SyllableRangeBar } from './slice-editor/SyllableRangeBar';
import { ImageCanvas } from './slice-editor/ImageCanvas';
// SlicePreview import removed per UX feedback 2026-04-20
import { flattenSyllables, computeSyllableCuts } from '../lib/sliceUtils';
import type { ManuscriptSource, ManuscriptLine, StoredImage } from '../lib/models';

// ── Screen props ─────────────────────────────────────────────────────────────

interface ScreenProps {
  onNext: () => void;
  onPrev: () => void;
  canGoNext: boolean;
  canGoPrev: boolean;
}

// ── Helper: computeCoveredSyllables ─────────────────────────────────────────

/**
 * Computes the set of global syllable indices confirmed by OTHER lines in the source
 * (i.e., lines with confirmed=true, excluding the line identified by excludeLineId).
 */
function computeCoveredSyllables(source: ManuscriptSource, excludeLineId: string | null): number[] {
  const covered = new Set<number>();
  for (const line of source.lines) {
    if (line.id === excludeLineId) continue;
    if (!line.confirmed) continue;
    for (let i = line.syllableRange.start; i <= line.syllableRange.end; i++) {
      covered.add(i);
    }
  }
  return Array.from(covered);
}

// ── SliceEditor ──────────────────────────────────────────────────────────────

export function SliceEditor({ onNext, onPrev, canGoNext, canGoPrev }: ScreenProps) {
  const { state: globalState, dispatch: globalDispatch } = useProject();
  const [editorState, editorDispatch] = useReducer(editorReducer, initialEditorState);
  const [isConfirming, setIsConfirming] = useState<boolean>(false);
  const [awaitingNewLine, setAwaitingNewLine] = useState<boolean>(false);
  const [showAllBoxes, setShowAllBoxes] = useState<boolean>(true);
  const [sameSizeMode, setSameSizeMode] = useState<boolean>(false);

  const project = globalState.project;
  const totalSyllableCount = project ? flattenSyllables(project.text.words).length : 0;
  const activeSource = project?.sources.find(s => s.id === editorState.activeSourceId) ?? null;

  // Derive activeLine by id, not positional lines[0]
  const activeLine = activeSource?.lines.find(l => l.id === editorState.activeLineId) ?? null;
  const hasImage = !!activeLine?.image;

  // Compute the text label of the active syllable (for clear UX feedback)
  const activeSyllableLabel: string | null = (() => {
    if (!project || editorState.activeSyllableIdx === null) return null;
    const flat = flattenSyllables(project.text.words);
    const idx = editorState.activeSyllableIdx;
    if (idx < 0 || idx >= flat.length) return null;
    return flat[idx];
  })();

  // ── Auto-select first source on mount ────────────────────────────────────

  useEffect(() => {
    if (project && project.sources.length > 0 && editorState.activeSourceId === null) {
      const firstSource = project.sources[0];
      // Prefer first unconfirmed line; fall back to first line
      const firstLine = firstSource.lines.find(l => !l.confirmed) ?? firstSource.lines[0];
      const covered = firstLine
        ? computeCoveredSyllables(firstSource, firstLine.id)
        : [];
      editorDispatch({
        type: 'LOAD_SOURCE',
        payload: {
          sourceId: firstSource.id,
          lineId: firstLine?.id ?? '',
          initialDividers: firstLine?.dividers ?? [],
          syllableRange:
            firstLine?.syllableRange &&
            !(firstLine.syllableRange.start === 0 && firstLine.syllableRange.end === 0)
              ? firstLine.syllableRange
              : { start: 0, end: Math.max(0, totalSyllableCount - 1) },
          gaps: firstLine?.gaps ?? [],
          coveredSyllables: covered,
          syllableBoxes: firstLine?.syllableBoxes ?? {},
        },
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Reload when activeSourceId changes ───────────────────────────────────

  useEffect(() => {
    if (!project || !editorState.activeSourceId) return;
    const source = project.sources.find(s => s.id === editorState.activeSourceId);
    if (!source) return;
    // Prefer first unconfirmed line; fall back to first line
    const line = source.lines.find(l => !l.confirmed) ?? source.lines[0];
    const covered = line ? computeCoveredSyllables(source, line.id) : [];
    editorDispatch({
      type: 'LOAD_SOURCE',
      payload: {
        sourceId: source.id,
        lineId: line?.id ?? '',
        initialDividers: line?.dividers ?? [],
        syllableRange:
          line?.syllableRange &&
          !(line.syllableRange.start === 0 && line.syllableRange.end === 0)
            ? line.syllableRange
            : { start: 0, end: Math.max(0, totalSyllableCount - 1) },
        gaps: line?.gaps ?? [],
        coveredSyllables: covered,
        syllableBoxes: line?.syllableBoxes ?? {},
      },
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editorState.activeSourceId]);

  // ── Auto-save boxes to the active line (so TablePreview sees them immediately) ──
  // Debounced to avoid excessive dispatches during drag (drag updates are in
  // editorState only; on pointerup we get a final SET_BOX that fires this save).
  useEffect(() => {
    if (!project || !editorState.activeSourceId || !editorState.activeLineId) return;
    const source = project.sources.find(s => s.id === editorState.activeSourceId);
    if (!source) return;
    const line = source.lines.find(l => l.id === editorState.activeLineId);
    if (!line) return;

    // Skip if nothing actually changed (prevents infinite loop)
    const currentJson = JSON.stringify(line.syllableBoxes ?? {});
    const newJson = JSON.stringify(editorState.syllableBoxes);
    if (currentJson === newJson) return;

    const timer = setTimeout(() => {
      // Auto-confirm the line when at least one box has been drawn.
      const hasAnyBox = Object.values(editorState.syllableBoxes).some(b => b != null);
      const updatedLine: ManuscriptLine = {
        ...line,
        syllableBoxes: editorState.syllableBoxes,
        syllableRange: editorState.syllableRange ?? line.syllableRange,
        gaps: editorState.gaps,
        confirmed: hasAnyBox,
      };
      const updatedLines = source.lines.map(l => (l.id === line.id ? updatedLine : l));
      globalDispatch({
        type: 'UPDATE_SOURCE',
        payload: { ...source, lines: updatedLines },
      });
    }, 300);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editorState.syllableBoxes, editorState.syllableRange, editorState.gaps, editorState.activeLineId]);

  // ── Paste handler ─────────────────────────────────────────────────────────

  useEffect(() => {
    const handler = async (_e: ClipboardEvent) => {
      if (!activeSource) return;
      const result = await window.mocquereau.readClipboardImage();
      if (result) {
        setAwaitingNewLine(false);
        applyImageToSource(activeSource, result);
      }
    };
    window.addEventListener('paste', handler);
    return () => window.removeEventListener('paste', handler);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeSource]);

  // ── applyImageToSource ────────────────────────────────────────────────────

  function applyImageToSource(
    source: ManuscriptSource,
    ipcResult: { dataUrl: string; width: number; height: number },
  ) {
    const storedImage: StoredImage = {
      dataUrl: ipcResult.dataUrl,
      width: ipcResult.width,
      height: ipcResult.height,
      mimeType: 'image/png',
    };

    // D-06: Auto-suggest range starting from end of last confirmed line + 1
    const lastConfirmed = [...source.lines].reverse().find(l => l.confirmed);
    const suggestedStart = lastConfirmed ? lastConfirmed.syllableRange.end + 1 : 0;
    const totalSyls = flattenSyllables(project!.text.words).length;
    const suggestedEnd = Math.max(suggestedStart, totalSyls - 1);

    const newLine: ManuscriptLine = {
      id: crypto.randomUUID(),
      image: storedImage,
      syllableRange: { start: suggestedStart, end: suggestedEnd },
      dividers: [],  // kept for backward compat; not used by new code
      syllableBoxes: {},  // start with no boxes on new line
      gaps: [],
      confirmed: false,
    };

    // Append new line — do NOT replace lines[0]
    const updatedSource: ManuscriptSource = {
      ...source,
      lines: [...source.lines, newLine],
    };
    globalDispatch({ type: 'UPDATE_SOURCE', payload: updatedSource });

    const covered = computeCoveredSyllables(updatedSource, newLine.id);
    editorDispatch({
      type: 'SWITCH_LINE',
      payload: {
        lineId: newLine.id,
        initialDividers: [],
        syllableRange: newLine.syllableRange,
        gaps: [],
        coveredSyllables: covered,
        syllableBoxes: {},
      },
    });
  }

  // ── handleSelectLine ──────────────────────────────────────────────────────

  function handleSelectLine(lineId: string) {
    if (!project || !editorState.activeSourceId) return;
    const source = project.sources.find(s => s.id === editorState.activeSourceId);
    if (!source) return;
    const line = source.lines.find(l => l.id === lineId);
    if (!line) return;
    const covered = computeCoveredSyllables(source, lineId);
    editorDispatch({
      type: 'SWITCH_LINE',
      payload: {
        lineId,
        initialDividers: line.dividers,
        syllableRange: line.syllableRange,
        gaps: line.gaps,
        coveredSyllables: covered,
        syllableBoxes: line.syllableBoxes ?? {},
      },
    });
    setAwaitingNewLine(false);
  }

  // ── handleAddLine ─────────────────────────────────────────────────────────

  function handleAddLine() {
    setAwaitingNewLine(true);
  }

  // ── handleRemoveLine ──────────────────────────────────────────────────────

  function handleRemoveLine(lineId: string) {
    if (!project || !editorState.activeSourceId) return;
    const source = project.sources.find(s => s.id === editorState.activeSourceId);
    if (!source) return;

    const removedLine = source.lines.find(l => l.id === lineId);
    if (!removedLine) return;

    // Remove syllableCuts for this line's range
    const newCuts = { ...source.syllableCuts };
    for (let i = removedLine.syllableRange.start; i <= removedLine.syllableRange.end; i++) {
      delete newCuts[i];
    }

    const updatedSource: ManuscriptSource = {
      ...source,
      lines: source.lines.filter(l => l.id !== lineId),
      syllableCuts: newCuts,
    };
    globalDispatch({ type: 'UPDATE_SOURCE', payload: updatedSource });
    editorDispatch({ type: 'REMOVE_LINE', payload: { lineId } });

    // If removed line was active, switch to first remaining line
    if (lineId === editorState.activeLineId && updatedSource.lines.length > 0) {
      const nextLine = updatedSource.lines[0];
      const covered = computeCoveredSyllables(updatedSource, nextLine.id);
      editorDispatch({
        type: 'SWITCH_LINE',
        payload: {
          lineId: nextLine.id,
          initialDividers: nextLine.dividers,
          syllableRange: nextLine.syllableRange,
          gaps: nextLine.gaps,
          coveredSyllables: covered,
          syllableBoxes: nextLine.syllableBoxes ?? {},
        },
      });
    }
  }

  // ── Confirmar handler ─────────────────────────────────────────────────────

  async function handleConfirm() {
    if (!project || !editorState.activeSourceId || !editorState.syllableRange || !editorState.activeLineId) return;
    const source = project.sources.find(s => s.id === editorState.activeSourceId);
    if (!source) return;
    // Find line by id, not positional
    const line = source.lines.find(l => l.id === editorState.activeLineId);
    if (!line) return;

    setIsConfirming(true);
    try {
      const newCuts = await computeSyllableCuts(
        line.image,
        editorState.syllableBoxes,
        editorState.syllableRange,
      );

      const updatedLine: ManuscriptLine = {
        ...line,
        dividers: line.dividers,  // preserve (backward compat, not used)
        syllableBoxes: editorState.syllableBoxes,  // save current boxes to line
        syllableRange: editorState.syllableRange,
        gaps: editorState.gaps,
        confirmed: true,
      };

      // Only update the confirmed line; leave other lines unchanged
      const updatedLines = source.lines.map(l =>
        l.id === updatedLine.id ? updatedLine : l
      );
      const updatedSource: ManuscriptSource = {
        ...source,
        lines: updatedLines,
        syllableCuts: { ...source.syllableCuts, ...newCuts },
      };

      globalDispatch({ type: 'UPDATE_SOURCE', payload: updatedSource });
      editorDispatch({ type: 'CONFIRM_COMMITTED' });
    } finally {
      setIsConfirming(false);
    }
  }

  // ── Limpar handler ────────────────────────────────────────────────────────

  function handleClear() {
    if (!project || !editorState.activeSourceId) return;
    const source = project.sources.find(s => s.id === editorState.activeSourceId);
    if (!source) return;
    const updatedSource: ManuscriptSource = { ...source, syllableCuts: {} };
    const updatedLines = source.lines.map(l => ({
      ...l,
      dividers: [],
      gaps: [],
      syllableBoxes: {},
      confirmed: false,
    }));
    globalDispatch({ type: 'UPDATE_SOURCE', payload: { ...updatedSource, lines: updatedLines } });
    editorDispatch({ type: 'CLEAR_LINE' });
  }

  // ── Source navigation ─────────────────────────────────────────────────────

  function navigateSource(direction: 'prev' | 'next') {
    if (!project) return;
    const sources = project.sources;
    const currentIdx = sources.findIndex(s => s.id === editorState.activeSourceId);
    const nextIdx = direction === 'next' ? currentIdx + 1 : currentIdx - 1;
    if (nextIdx >= 0 && nextIdx < sources.length) {
      const nextSource = sources[nextIdx];
      // Prefer first unconfirmed line; fall back to first
      const nextLine = nextSource.lines.find(l => !l.confirmed) ?? nextSource.lines[0];
      const covered = nextLine ? computeCoveredSyllables(nextSource, nextLine.id) : [];
      editorDispatch({
        type: 'LOAD_SOURCE',
        payload: {
          sourceId: nextSource.id,
          lineId: nextLine?.id ?? '',
          initialDividers: nextLine?.dividers ?? [],
          syllableRange: nextLine?.syllableRange ?? { start: 0, end: Math.max(0, totalSyllableCount - 1) },
          gaps: nextLine?.gaps ?? [],
          coveredSyllables: covered,
          syllableBoxes: nextLine?.syllableBoxes ?? {},
        },
      });
    }
  }

  // D-15: Tab/Enter cycle activeSyllableIdx within range; at boundary → next/prev line
  function navigateLines(direction: 1 | -1) {
    if (!project || !editorState.activeSourceId) return;
    const source = project.sources.find(s => s.id === editorState.activeSourceId);
    if (!source || source.lines.length === 0) return;

    const currentIdx = source.lines.findIndex(l => l.id === editorState.activeLineId);
    const nextIdx = currentIdx + direction;

    if (nextIdx >= 0 && nextIdx < source.lines.length) {
      // Navigate within same source's lines
      const nextLine = source.lines[nextIdx];
      const covered = computeCoveredSyllables(source, nextLine.id);
      editorDispatch({
        type: 'SWITCH_LINE',
        payload: {
          lineId: nextLine.id,
          initialDividers: nextLine.dividers,
          syllableRange: nextLine.syllableRange,
          gaps: nextLine.gaps,
          coveredSyllables: covered,
          syllableBoxes: nextLine.syllableBoxes ?? {},
        },
      });
    } else {
      // At boundary — navigate to adjacent source
      navigateSource(direction === 1 ? 'next' : 'prev');
    }
  }

  // Use latest state/callbacks via ref so the window listener always sees fresh values
  const keyHandlerStateRef = useRef({
    editorState,
    navigateSource,
    navigateLines,
    editorDispatch,
  });
  keyHandlerStateRef.current = {
    editorState,
    navigateSource,
    navigateLines,
    editorDispatch,
  };

  // Global keyboard handler — avoids focus issues where Tab needs to be pressed
  // twice because the outer div lost focus after clicking on labels/images.
  useEffect(() => {
    function handler(e: KeyboardEvent) {
      // Skip when user is typing in a real input (e.g. numeric range inputs)
      const target = e.target as HTMLElement;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) {
        return;
      }
      const { editorState: es, editorDispatch: ed, navigateSource: ns, navigateLines: nl } = keyHandlerStateRef.current;
      const range = es.syllableRange;
      if (!range) return;

      if ((e.key === 'Tab' && !e.shiftKey) || e.key === 'Enter') {
        if (e.key === 'Enter' && e.ctrlKey) {
          e.preventDefault();
          ns('next');
          return;
        }
        e.preventDefault();
        if (es.activeSyllableIdx !== null) {
          const next = es.activeSyllableIdx + 1;
          if (next <= range.end) {
            ed({ type: 'SET_ACTIVE_SYLLABLE', payload: next });
          } else {
            nl(1);
          }
        } else {
          ed({ type: 'SET_ACTIVE_SYLLABLE', payload: range.start });
        }
        return;
      }

      if (e.key === 'Tab' && e.shiftKey) {
        e.preventDefault();
        if (es.activeSyllableIdx !== null) {
          const prev = es.activeSyllableIdx - 1;
          if (prev >= range.start) {
            ed({ type: 'SET_ACTIVE_SYLLABLE', payload: prev });
          } else {
            nl(-1);
          }
        } else {
          ed({ type: 'SET_ACTIVE_SYLLABLE', payload: range.end });
        }
        return;
      }

      // Delete/Backspace: remove the box for the active syllable (individual delete)
      if ((e.key === 'Delete' || e.key === 'Backspace') && es.activeSyllableIdx !== null) {
        if (es.syllableBoxes[es.activeSyllableIdx] != null) {
          e.preventDefault();
          ed({ type: 'DELETE_BOX', payload: { syllableIdx: es.activeSyllableIdx } });
        }
        return;
      }

      // Arrow keys: nudge the active box by 1px (Shift: 10px).
      const arrows = ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'];
      if (arrows.includes(e.key) && es.activeSyllableIdx !== null) {
        const box = es.syllableBoxes[es.activeSyllableIdx];
        if (!box) return;
        e.preventDefault();
        const img = document.querySelector<HTMLElement>('[data-image-wrapper]');
        if (!img) return;
        const rect = img.getBoundingClientRect();
        const pixels = e.shiftKey ? 10 : 1;
        const dx = pixels / rect.width;
        const dy = pixels / rect.height;
        let { x, y } = box;
        if (e.key === 'ArrowLeft')  x -= dx;
        if (e.key === 'ArrowRight') x += dx;
        if (e.key === 'ArrowUp')    y -= dy;
        if (e.key === 'ArrowDown')  y += dy;
        // Clamp to [0, 1-size]
        x = Math.max(0, Math.min(1 - box.w, x));
        y = Math.max(0, Math.min(1 - box.h, y));
        ed({ type: 'SET_BOX', payload: { syllableIdx: es.activeSyllableIdx, box: { ...box, x, y } } });
        return;
      }
    }
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  // ── No project guard ──────────────────────────────────────────────────────

  if (!project) {
    return (
      <div className="flex items-center justify-center h-full text-gray-400">
        Abra ou crie um projeto para começar.
      </div>
    );
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-1 min-h-0 focus:outline-none">
      {/* Left sidebar — sources */}
      <SourceSidebar
        sources={project.sources}
        activeSourceId={editorState.activeSourceId}
        totalSyllableCount={totalSyllableCount}
        onSelectSource={(id) => {
          const src = project.sources.find(s => s.id === id);
          const line = src?.lines.find(l => !l.confirmed) ?? src?.lines[0];
          const covered = (src && line) ? computeCoveredSyllables(src, line.id) : [];
          editorDispatch({
            type: 'LOAD_SOURCE',
            payload: {
              sourceId: id,
              lineId: line?.id ?? '',
              initialDividers: line?.dividers ?? [],
              syllableRange:
                line?.syllableRange ??
                { start: 0, end: Math.max(0, totalSyllableCount - 1) },
              gaps: line?.gaps ?? [],
              coveredSyllables: covered,
              syllableBoxes: line?.syllableBoxes ?? {},
            },
          });
        }}
      />

      {/* Second sidebar — lines of active source */}
      {activeSource && (
        <LineSidebar
          lines={activeSource.lines}
          activeLineId={editorState.activeLineId}
          words={project.text.words}
          totalSyllableCount={totalSyllableCount}
          onSelectLine={handleSelectLine}
          onAddLine={handleAddLine}
          onRemoveLine={handleRemoveLine}
          onUpdateMetadata={(lineId, folio, label) => {
            if (!activeSource) return;
            globalDispatch({
              type: 'UPDATE_LINE_METADATA',
              payload: { sourceId: activeSource.id, lineId, folio, label },
            });
          }}
        />
      )}

      {/* Main panel */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top bar */}
        <div className="flex items-center justify-between px-4 py-2 border-b border-gray-200 bg-white flex-shrink-0">
          <span className="text-sm font-medium text-gray-700 truncate">
            {activeSource?.metadata.siglum ?? 'Nenhuma fonte selecionada'}
          </span>
          <div className="flex items-center gap-3">
            <span className="text-xs text-gray-400">
              Alterações salvas automaticamente
            </span>
            <button
              type="button"
              className="px-3 py-1.5 text-xs bg-orange-50 hover:bg-orange-100 text-orange-700 rounded border border-orange-300 disabled:opacity-40"
              onClick={() => {
                if (editorState.activeSyllableIdx !== null) {
                  editorDispatch({ type: 'DELETE_BOX', payload: { syllableIdx: editorState.activeSyllableIdx } });
                }
              }}
              disabled={
                !hasImage ||
                editorState.activeSyllableIdx === null ||
                editorState.syllableBoxes[editorState.activeSyllableIdx] == null
              }
              title="Remover caixa da sílaba ativa (Delete)"
            >
              Remover caixa
            </button>
            <button
              type="button"
              className="px-3 py-1.5 text-xs bg-red-50 hover:bg-red-100 text-red-700 rounded border border-red-300"
              onClick={handleClear}
              disabled={!hasImage}
            >
              Limpar tudo
            </button>
          </div>
        </div>

        {/* Range controls — shown when an image is loaded */}
        {hasImage && (
          <div className="flex-shrink-0 bg-white border-b border-gray-200 px-3 py-2">
            {/* Numeric inputs row */}
            <div className="flex items-center gap-3 mb-2">
              <span className="text-xs text-gray-500 font-medium">Range:</span>
              <label className="flex items-center gap-1 text-xs text-gray-600">
                De
                <input
                  type="number"
                  min={0}
                  max={totalSyllableCount - 1}
                  value={editorState.syllableRange?.start ?? 0}
                  onChange={(e) => {
                    const val = parseInt(e.target.value, 10);
                    if (isNaN(val)) return;
                    const end = editorState.syllableRange?.end ?? totalSyllableCount - 1;
                    editorDispatch({ type: 'SET_RANGE', payload: { start: Math.min(val, end), end } });
                  }}
                  className="w-14 px-1 py-0.5 border border-gray-300 rounded text-xs text-center"
                />
              </label>
              <label className="flex items-center gap-1 text-xs text-gray-600">
                Até
                <input
                  type="number"
                  min={0}
                  max={totalSyllableCount - 1}
                  value={editorState.syllableRange?.end ?? totalSyllableCount - 1}
                  onChange={(e) => {
                    const val = parseInt(e.target.value, 10);
                    if (isNaN(val)) return;
                    const start = editorState.syllableRange?.start ?? 0;
                    editorDispatch({ type: 'SET_RANGE', payload: { start, end: Math.max(val, start) } });
                  }}
                  className="w-14 px-1 py-0.5 border border-gray-300 rounded text-xs text-center"
                />
              </label>
            </div>

            {/* Syllable range bar — horizontal scroll, auto-follows active chip */}
            <SyllableRangeBar
              words={project.text.words}
              syllableRange={editorState.syllableRange}
              gaps={editorState.gaps}
              hoveredSyllableIdx={editorState.hoveredSyllableIdx}
              activeSyllableIdx={editorState.activeSyllableIdx}
              coveredSyllables={editorState.coveredSyllables}
              onRangeChange={(range) => editorDispatch({ type: 'SET_RANGE', payload: range })}
              onGapToggle={(idx) => editorDispatch({ type: 'TOGGLE_GAP', payload: idx })}
              onHover={(idx) => editorDispatch({ type: 'SET_HOVER', payload: idx })}
              onRename={(globalIdx, newText) => {
                if (!project) return;
                // Convert globalIdx → (wordIdx, sylIdx)
                let offset = 0;
                for (let w = 0; w < project.text.words.length; w++) {
                  const len = project.text.words[w].syllables.length;
                  if (globalIdx < offset + len) {
                    const sylIdx = globalIdx - offset;
                    globalDispatch({
                      type: 'UPDATE_SYLLABLE_TEXT',
                      payload: { wordIdx: w, sylIdx, newText },
                    });
                    return;
                  }
                  offset += len;
                }
              }}
            />
          </div>
        )}

        {/* Instruction banner — active syllable indicator + toggle */}
        {hasImage && (
          <div className="flex-shrink-0 bg-blue-50 border-b border-blue-200 px-4 py-2 text-xs text-blue-900 flex items-center justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              {activeSyllableLabel !== null ? (
                <span className="flex items-center gap-2">
                  <span className="text-gray-600">Marcando área para:</span>
                  <span className="inline-block px-2 py-0.5 bg-blue-600 text-white font-bold rounded text-sm font-mono">
                    {activeSyllableLabel}
                  </span>
                  <span className="text-gray-500 hidden md:inline">
                    — arraste na imagem para desenhar · Tab/Enter = próxima
                  </span>
                </span>
              ) : (
                <span className="text-gray-600">
                  <span className="font-medium">Clique em uma sílaba acima</span> para começar a marcar sua área
                </span>
              )}
            </div>
            <div className="flex items-center gap-4">
              <label className="flex items-center gap-2 cursor-pointer whitespace-nowrap">
                <input
                  type="checkbox"
                  checked={sameSizeMode}
                  onChange={(e) => setSameSizeMode(e.target.checked)}
                  className="w-4 h-4"
                />
                <span className="font-medium">Mesmo tamanho da 1ª</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer whitespace-nowrap">
                <input
                  type="checkbox"
                  checked={showAllBoxes}
                  onChange={(e) => setShowAllBoxes(e.target.checked)}
                  className="w-4 h-4"
                />
                <span className="font-medium">Ver todas as caixas</span>
              </label>
            </div>
          </div>
        )}

        {/* Image canvas (main area) or drop zone */}
        <div className="flex-1 min-h-0">
          {(hasImage && !awaitingNewLine) ? (
            <ImageCanvas
              image={activeLine!.image}
              syllableBoxes={editorState.syllableBoxes}
              activeSyllableIdx={editorState.activeSyllableIdx}
              syllableRange={editorState.syllableRange}
              gaps={editorState.gaps}
              hoveredSyllableIdx={editorState.hoveredSyllableIdx}
              zoom={editorState.zoom}
              panOffset={editorState.panOffset}
              dispatch={editorDispatch}
              words={project.text.words}
              showAllBoxes={showAllBoxes}
              sameSizeMode={sameSizeMode}
            />
          ) : (
            <DropZone
              onImageLoaded={(source, result) => {
                setAwaitingNewLine(false);
                applyImageToSource(source, result);
              }}
              activeSource={activeSource}
            />
          )}
        </div>

        {/* Navigation footer */}
        <div className="flex justify-between px-4 py-2 border-t border-gray-200 bg-white flex-shrink-0">
          <button
            onClick={onPrev}
            disabled={!canGoPrev}
            className="px-4 py-2 bg-gray-200 text-gray-700 rounded disabled:opacity-40 hover:bg-gray-300"
          >
            Anterior
          </button>
          <button
            onClick={onNext}
            disabled={!canGoNext}
            className="px-4 py-2 bg-blue-600 text-white rounded disabled:opacity-40 hover:bg-blue-700"
          >
            Próximo
          </button>
        </div>
      </div>
    </div>
  );
}

// ── DropZone ──────────────────────────────────────────────────────────────────

function DropZone({
  onImageLoaded,
  activeSource,
}: {
  onImageLoaded: (source: ManuscriptSource, result: { dataUrl: string; width: number; height: number }) => void;
  activeSource: ManuscriptSource | null;
}) {
  async function handleImageDrop(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    if (!activeSource) return;
    const file = e.dataTransfer.files[0];
    if (!file || !file.type.startsWith('image/')) return;
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result as string;
      const img = new Image();
      img.onload = () => {
        onImageLoaded(activeSource, { dataUrl, width: img.naturalWidth, height: img.naturalHeight });
      };
      img.src = dataUrl;
    };
    reader.readAsDataURL(file);
  }

  async function handleUploadClick() {
    if (!activeSource) return;
    const result = await window.mocquereau.openImageFile();
    if (result) onImageLoaded(activeSource, result);
  }

  return (
    <div
      className="flex-1 border-2 border-dashed border-gray-300 rounded-lg flex flex-col items-center justify-center gap-3 m-4 text-gray-400"
      onDragOver={(e) => { e.preventDefault(); }}
      onDrop={handleImageDrop}
    >
      <p className="text-sm">Arraste uma imagem aqui</p>
      <p className="text-xs">ou</p>
      <button
        type="button"
        className="px-3 py-1.5 bg-blue-600 text-white text-sm rounded hover:bg-blue-700"
        onClick={handleUploadClick}
      >
        Selecionar arquivo
      </button>
      <p className="text-xs">ou Ctrl+V para colar</p>
    </div>
  );
}
