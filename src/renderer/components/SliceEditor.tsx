// src/renderer/components/SliceEditor.tsx

import { useReducer, useEffect, useState, useRef } from 'react';
import { useProject } from '../hooks/useProject';
import { editorReducer, initialEditorState } from './slice-editor/editorReducer';
import { SourceSidebar } from './slice-editor/SourceSidebar';
import { LineSidebar } from './slice-editor/LineSidebar';
import { SyllableRangeBar } from './slice-editor/SyllableRangeBar';
import { ImageCanvas } from './slice-editor/ImageCanvas';
import { ImageAdjustmentsPanel } from './slice-editor/ImageAdjustmentsPanel';
import { SlidersHorizontal } from 'lucide-react';
// SlicePreview import removed per UX feedback 2026-04-20
import { flattenSyllables, computeSyllableCuts } from '../lib/sliceUtils';
import { boxesInView, hasAnyBox } from '@shared/box-frame';
import { RealignBoxesDialog } from './slice-editor/RealignBoxesDialog';
import { usePendingFlush } from '../hooks/pendingEdits';
import type { ManuscriptSource, ManuscriptLine, StoredImage, ImageAdjustments } from '../lib/models';
import { useTranslation } from 'react-i18next';

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

/** Alvos cujas teclas não são do editor (atalhos globais Tab/Enter/Delete/setas). */
export function isOutsideEditorKeys(target: Element): boolean {
  if (target.tagName === 'BUTTON' || target.tagName === 'SELECT') return true;
  return (
    target.closest('[role=menubar],[role=menu],[role=toolbar],[role=dialog],[role=tablist]') !== null
  );
}

export function SliceEditor() {
  const { state: globalState, dispatch: globalDispatch, pending } = useProject();
  const { t } = useTranslation();
  const [editorState, editorDispatch] = useReducer(editorReducer, initialEditorState);
  const [isConfirming, setIsConfirming] = useState<boolean>(false);
  const [awaitingNewLine, setAwaitingNewLine] = useState<boolean>(false);
  const [showAllBoxes, setShowAllBoxes] = useState<boolean>(true);
  const [sameSizeMode, setSameSizeMode] = useState<boolean>(false);
  const [showAdjustmentsPanel, setShowAdjustmentsPanel] = useState<boolean>(false);
  const [showRealign, setShowRealign] = useState<boolean>(false);

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
          syllableBoxes: firstLine ? boxesInView(firstLine) : {},
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
        syllableBoxes: line ? boxesInView(line) : {},
      },
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editorState.activeSourceId]);

  // ── Close adjustments panel whenever active source/line changes ───────────
  useEffect(() => {
    setShowAdjustmentsPanel(false);
  }, [editorState.activeSourceId, editorState.activeLineId]);

  // ── handleUpdateAdjustments ───────────────────────────────────────────────
  function handleUpdateAdjustments(partial: Partial<ImageAdjustments>) {
    if (!editorState.activeSourceId || !editorState.activeLineId) return;
    globalDispatch({
      type: 'UPDATE_LINE_ADJUSTMENTS',
      payload: {
        sourceId: editorState.activeSourceId,
        lineId: editorState.activeLineId,
        adjustments: partial,
      },
    });
  }

  // ── R1: reload boxes when the view frame changes (rotation/flip) ─────────
  // Until wave B (spec D6) the editor keeps a local copy of the boxes, in the
  // frame the user sees. Stored boxes never move (they stay in line.boxFrame);
  // when the current frame or boxFrame changes, re-derive the view copy.
  const activeFrameKey = activeLine
    ? [
        activeLine.id,
        activeLine.imageAdjustments?.rotation ?? 0,
        !!activeLine.imageAdjustments?.flipH,
        !!activeLine.imageAdjustments?.flipV,
        activeLine.boxFrame
          ? `${activeLine.boxFrame.rotation}|${activeLine.boxFrame.flipH}|${activeLine.boxFrame.flipV}`
          : 'none',
      ].join('|')
    : '';
  const prevFrameKeyRef = useRef(activeFrameKey);
  useEffect(() => {
    const prev = prevFrameKeyRef.current;
    prevFrameKeyRef.current = activeFrameKey;
    if (!activeLine || prev === activeFrameKey) return;
    // Line switch: SWITCH_LINE / LOAD_SOURCE already loaded this line's boxes.
    if (!prev.startsWith(`${activeLine.id}|`)) return;
    editorDispatch({ type: 'REPLACE_BOXES', payload: boxesInView(activeLine) });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeFrameKey]);

  // ── Auto-save boxes to the active line (so TablePreview sees them immediately) ──
  // Debounced to avoid excessive dispatches during drag (drag updates are in
  // editorState only; on pointerup we get a final SET_BOX that fires this save).
  // Ao desmontar (troca de vista), o sync pendente é executado na hora em vez de
  // descartado (a onda B remove este sync de vez).
  const pendingBoxSync = useRef<(() => void) | null>(null);
  useEffect(() => {
    pendingBoxSync.current = null;
    if (!project || !editorState.activeSourceId || !editorState.activeLineId) return;
    const source = project.sources.find(s => s.id === editorState.activeSourceId);
    if (!source) return;
    const line = source.lines.find(l => l.id === editorState.activeLineId);
    if (!line) return;

    // Skip if nothing actually changed (prevents infinite loop). The editor
    // holds view-frame boxes, so compare against the line seen in that frame.
    const currentJson = JSON.stringify(boxesInView(line));
    const newJson = JSON.stringify(editorState.syllableBoxes);
    if (currentJson === newJson) return;

    const sync = () => {
      // Já gravado por um flush (Salvar, Desfazer…): o timer não repete o dispatch.
      if (pendingBoxSync.current !== sync) return;
      pendingBoxSync.current = null;
      // Auto-confirm the line when at least one box has been drawn.
      const hasAnyBox = Object.values(editorState.syllableBoxes).some(b => b != null);
      globalDispatch({
        type: 'UPDATE_LINE_BOXES',
        payload: {
          sourceId: source.id,
          lineId: line.id,
          syllableBoxes: editorState.syllableBoxes,
          syllableRange: editorState.syllableRange ?? line.syllableRange,
          gaps: editorState.gaps,
          confirmed: hasAnyBox,
        },
      });
    };
    pendingBoxSync.current = sync;
    pending?.markPending();
    const timer = setTimeout(sync, 300);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editorState.syllableBoxes, editorState.syllableRange, editorState.gaps, editorState.activeLineId]);

  // Flush do sync pendente ao sair da vista Recortes (antes de 300 ms) e antes de
  // Novo/Abrir/Fechar/Salvar/Desfazer (registro de pendências do projeto).
  usePendingFlush(() => {
    const sync = pendingBoxSync.current;
    if (!sync) return false;
    sync();
    return true;
  });

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
        syllableBoxes: boxesInView(line),
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
          syllableBoxes: boxesInView(nextLine),
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
      // editorState.syllableBoxes are in the current view frame: crop that view.
      const newCuts = await computeSyllableCuts(
        line.image,
        editorState.syllableBoxes,
        editorState.syllableRange,
        line.imageAdjustments,
      );

      globalDispatch({
        type: 'UPDATE_LINE_BOXES',
        payload: {
          sourceId: source.id,
          lineId: line.id,
          syllableBoxes: editorState.syllableBoxes,  // save current boxes to line
          syllableRange: editorState.syllableRange,
          gaps: editorState.gaps,
          confirmed: true,
          syllableCuts: newCuts,
        },
      });
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
          syllableBoxes: nextLine ? boxesInView(nextLine) : {},
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
          syllableBoxes: boxesInView(nextLine),
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
      // Teclas da casca e de controles nativos ficam com eles: menus, barra de
      // ferramentas, abas de vista e diálogos navegam com setas/Tab/Enter, e um
      // botão ou select focado responde a Enter/setas por conta própria.
      if (target instanceof Element && isOutsideEditorKeys(target)) return;
      const { editorState: es, editorDispatch: ed, navigateSource: ns, navigateLines: nl } = keyHandlerStateRef.current;
      const range = es.syllableRange;
      if (!range) return;

      if ((e.key === 'Tab' && !e.shiftKey) || e.key === 'Enter') {
        if (e.key === 'Enter' && e.ctrlKey) {
          e.preventDefault();
          ns('next');
          return;
        }
        // Tab/Enter avança a sílaba ativa em 1. Se passar de range.end, EXPANDE o
        // range automaticamente (mesma linha cobrindo mais sílabas). Limita pelo
        // total global de sílabas do projeto. Nunca pula para outra imagem —
        // troca de imagem é click no LineSidebar; troca de fonte é Ctrl+Enter.
        e.preventDefault();
        if (es.activeSyllableIdx !== null) {
          const next = es.activeSyllableIdx + 1;
          if (next >= totalSyllableCount) return; // já no fim global; nada a fazer
          ed({ type: 'SET_ACTIVE_SYLLABLE', payload: next });
          // Expande range.end se necessário para incluir a nova sílaba ativa.
          if (next > range.end) {
            ed({ type: 'SET_RANGE', payload: { start: range.start, end: next } });
          }
        } else {
          ed({ type: 'SET_ACTIVE_SYLLABLE', payload: range.start });
        }
        void nl;
        return;
      }

      if (e.key === 'Tab' && e.shiftKey) {
        e.preventDefault();
        if (es.activeSyllableIdx !== null) {
          const prev = es.activeSyllableIdx - 1;
          if (prev < 0) return; // antes do início global; nada a fazer
          ed({ type: 'SET_ACTIVE_SYLLABLE', payload: prev });
          // Encolhe range.start se necessário (puxa o início da linha para incluir).
          if (prev < range.start) {
            ed({ type: 'SET_RANGE', payload: { start: prev, end: range.end } });
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
      <div className="flex items-center justify-center h-full text-ink-muted">
        {t('sliceEditor.empty')}
      </div>
    );
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-1 min-h-0 min-w-0 focus:outline-none">
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
              syllableBoxes: line ? boxesInView(line) : {},
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
        <div className="flex items-center justify-between px-4 py-2 border-b border-rule-soft bg-surface flex-shrink-0">
          <span className="text-sm font-medium text-ink-soft truncate">
            {activeSource?.metadata.siglum ?? t('sliceEditor.noSourceSelected')}
          </span>
          <div className="flex items-center gap-3">
            <span className="text-xs text-ink-muted">
              {t('sliceEditor.autoSaved')}
            </span>
            <button
              type="button"
              className="px-3 py-1.5 text-xs bg-rubric-wash hover:bg-rubric-wash text-rubric rounded border border-rubric disabled:opacity-40 flex items-center gap-1.5"
              onClick={() => setShowAdjustmentsPanel(v => !v)}
              disabled={!hasImage}
              title={t('sliceEditor.adjustmentsTitle')}
              aria-pressed={showAdjustmentsPanel}
            >
              <SlidersHorizontal size={14} />
              {t('sliceEditor.adjustments')}
            </button>
            <button
              type="button"
              className="px-3 py-1.5 text-xs bg-orpiment-wash hover:bg-orpiment-wash text-warning rounded border border-warning disabled:opacity-40"
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
              title={t('sliceEditor.removeActiveBoxTitle')}
            >
              {t('sliceEditor.removeBox')}
            </button>
            <button
              type="button"
              className="px-3 py-1.5 text-xs bg-rubric-wash hover:bg-rubric-wash text-danger rounded border border-danger"
              onClick={handleClear}
              disabled={!hasImage}
            >
              {t('sliceEditor.clearAll')}
            </button>
          </div>
        </div>

        {/* Range controls — shown when an image is loaded */}
        {hasImage && (
          <div className="flex-shrink-0 bg-surface border-b border-rule-soft px-3 py-2">
            {/* Numeric inputs row */}
            <div className="flex items-center gap-3 mb-2">
              <span className="text-xs text-ink-muted font-medium">{t('sliceEditor.range')}</span>
              <label className="flex items-center gap-1 text-xs text-ink-soft">
                {t('sliceEditor.from')}
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
                  className="w-14 px-1 py-0.5 border border-rule rounded text-xs text-center"
                />
              </label>
              <label className="flex items-center gap-1 text-xs text-ink-soft">
                {t('sliceEditor.to')}
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
                  className="w-14 px-1 py-0.5 border border-rule rounded text-xs text-center"
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
          <div className="flex-shrink-0 bg-rubric-wash border-b border-rubric-soft px-4 py-2 text-xs text-rubric flex items-center justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              {activeSyllableLabel !== null ? (
                <span className="flex items-center gap-2">
                  <span className="text-ink-soft">{t('sliceEditor.markingAreaFor')}</span>
                  <span className="inline-block px-2 py-0.5 bg-rubric text-on-rubric font-bold rounded text-sm font-mono">
                    {activeSyllableLabel}
                  </span>
                  <span className="text-ink-muted hidden md:inline">
                    {t('sliceEditor.markingHint')}
                  </span>
                </span>
              ) : (
                <span className="text-ink-soft">
                  <><span className="font-medium">{t('sliceEditor.clickSyllableAbove')}</span> {t('sliceEditor.clickSyllableAboveSuffix')}</>
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
                <span className="font-medium">{t('sliceEditor.sameSizeAsFirst')}</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer whitespace-nowrap">
                <input
                  type="checkbox"
                  checked={showAllBoxes}
                  onChange={(e) => setShowAllBoxes(e.target.checked)}
                  className="w-4 h-4"
                />
                <span className="font-medium">{t('sliceEditor.showAllBoxes')}</span>
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
              adjustments={activeLine?.imageAdjustments}
              panelOpen={showAdjustmentsPanel}
              onUpdateAdjustments={handleUpdateAdjustments}
              onClosePanel={() => setShowAdjustmentsPanel(false)}
              onRealign={
                hasAnyBox(activeLine?.syllableBoxes)
                  ? () => {
                      // Boxes still in the editor's debounce go to the project first.
                      pendingBoxSync.current?.();
                      setShowRealign(true);
                    }
                  : undefined
              }
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
      </div>
      <RealignBoxesDialog open={showRealign} line={activeLine} onClose={() => setShowRealign(false)} />
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
  const { t } = useTranslation();
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
      className="flex-1 border-2 border-dashed border-rule rounded-lg flex flex-col items-center justify-center gap-3 m-4 text-ink-muted"
      onDragOver={(e) => { e.preventDefault(); }}
      onDrop={handleImageDrop}
    >
      <p className="text-sm">{t('sliceEditor.dropZone.dragImage')}</p>
      <p className="text-xs">{t('sliceEditor.dropZone.or')}</p>
      <button
        type="button"
        className="px-3 py-1.5 bg-rubric text-on-rubric text-sm rounded hover:bg-rubric-soft"
        onClick={handleUploadClick}
      >
        {t('sliceEditor.dropZone.selectFile')}
      </button>
      <p className="text-xs">{t('sliceEditor.dropZone.paste')}</p>
    </div>
  );
}
