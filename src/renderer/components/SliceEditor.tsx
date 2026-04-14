// src/renderer/components/SliceEditor.tsx

import { useReducer, useEffect, useState } from 'react';
import { useProject } from '../hooks/useProject';
import { editorReducer, initialEditorState } from './slice-editor/editorReducer';
import { SourceSidebar } from './slice-editor/SourceSidebar';
import { SyllableRangeBar } from './slice-editor/SyllableRangeBar';
import { ImageCanvas } from './slice-editor/ImageCanvas';
import { SlicePreview } from './slice-editor/SlicePreview';
import { flattenSyllables, computeSyllableCuts } from '../lib/sliceUtils';
import type { ManuscriptSource, ManuscriptLine, StoredImage } from '../lib/models';

// ── Screen props ─────────────────────────────────────────────────────────────

interface ScreenProps {
  onNext: () => void;
  onPrev: () => void;
  canGoNext: boolean;
  canGoPrev: boolean;
}

// ── Helper: auto-distribute ──────────────────────────────────────────────────

function autoDistribute(n: number): number[] {
  return Array.from({ length: Math.max(0, n - 1) }, (_, i) => (i + 1) / n);
}

// ── SliceEditor ──────────────────────────────────────────────────────────────

export function SliceEditor({ onNext, onPrev, canGoNext, canGoPrev }: ScreenProps) {
  const { state: globalState, dispatch: globalDispatch } = useProject();
  const [editorState, editorDispatch] = useReducer(editorReducer, initialEditorState);
  const [isConfirming, setIsConfirming] = useState<boolean>(false);

  const project = globalState.project;
  const totalSyllableCount = project ? flattenSyllables(project.text.words).length : 0;
  const activeSource = project?.sources.find(s => s.id === editorState.activeSourceId) ?? null;
  const activeLine = activeSource?.lines[0] ?? null;
  const hasImage = !!activeLine?.image;

  // ── Auto-select first source on mount ────────────────────────────────────

  useEffect(() => {
    if (project && project.sources.length > 0 && editorState.activeSourceId === null) {
      const firstSource = project.sources[0];
      const firstLine = firstSource.lines[0];
      const activeSylCount =
        firstLine?.syllableRange
          ? firstLine.syllableRange.end - firstLine.syllableRange.start + 1 - firstLine.gaps.length
          : totalSyllableCount;
      editorDispatch({
        type: 'LOAD_SOURCE',
        payload: {
          sourceId: firstSource.id,
          lineId: firstLine?.id ?? '',
          initialDividers:
            firstLine && firstLine.dividers.length > 0
              ? firstLine.dividers
              : autoDistribute(totalSyllableCount),
          syllableRange:
            firstLine?.syllableRange &&
            !(firstLine.syllableRange.start === 0 && firstLine.syllableRange.end === 0)
              ? firstLine.syllableRange
              : { start: 0, end: Math.max(0, totalSyllableCount - 1) },
          gaps: firstLine?.gaps ?? [],
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
    const line = source.lines[0];
    const activeSylCount = line?.syllableRange
      ? line.syllableRange.end - line.syllableRange.start + 1 - line.gaps.length
      : totalSyllableCount;
    editorDispatch({
      type: 'LOAD_SOURCE',
      payload: {
        sourceId: source.id,
        lineId: line?.id ?? '',
        initialDividers:
          line && line.dividers.length > 0
            ? line.dividers
            : autoDistribute(activeSylCount),
        syllableRange:
          line?.syllableRange &&
          !(line.syllableRange.start === 0 && line.syllableRange.end === 0)
            ? line.syllableRange
            : { start: 0, end: Math.max(0, totalSyllableCount - 1) },
        gaps: line?.gaps ?? [],
      },
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editorState.activeSourceId, project?.sources]);

  // ── Paste handler ─────────────────────────────────────────────────────────

  useEffect(() => {
    const handler = async (_e: ClipboardEvent) => {
      if (!activeSource) return;
      const result = await window.mocquereau.readClipboardImage();
      if (result) applyImageToSource(activeSource, result);
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
    const totalSyls = flattenSyllables(project!.text.words).length;
    const newLine: ManuscriptLine = {
      id: crypto.randomUUID(),
      image: storedImage,
      syllableRange: { start: 0, end: totalSyls - 1 },
      dividers: autoDistribute(totalSyls),
      gaps: [],
      confirmed: false,
    };
    const updatedSource: ManuscriptSource = { ...source, lines: [newLine] };
    globalDispatch({ type: 'UPDATE_SOURCE', payload: updatedSource });
    editorDispatch({
      type: 'LOAD_SOURCE',
      payload: {
        sourceId: source.id,
        lineId: newLine.id,
        initialDividers: newLine.dividers,
        syllableRange: newLine.syllableRange,
        gaps: [],
      },
    });
  }

  // ── Confirmar handler ─────────────────────────────────────────────────────

  async function handleConfirm() {
    if (!project || !editorState.activeSourceId || !editorState.syllableRange) return;
    const source = project.sources.find(s => s.id === editorState.activeSourceId);
    if (!source || !source.lines[0]) return;
    const line = source.lines[0];

    setIsConfirming(true);
    try {
      const newCuts = await computeSyllableCuts(
        line.image,
        editorState.dividers,
        editorState.syllableRange,
        editorState.gaps,
      );
      const updatedLine: ManuscriptLine = {
        ...line,
        dividers: editorState.dividers,
        syllableRange: editorState.syllableRange,
        gaps: editorState.gaps,
        confirmed: true,
      };
      const updatedSource: ManuscriptSource = {
        ...source,
        lines: [updatedLine],
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
      confirmed: false,
    }));
    globalDispatch({ type: 'UPDATE_SOURCE', payload: { ...updatedSource, lines: updatedLines } });
    editorDispatch({ type: 'CLEAR_LINE' });
  }

  // ── Keyboard navigation ───────────────────────────────────────────────────

  function navigateSource(direction: 'prev' | 'next') {
    if (!project) return;
    const sources = project.sources;
    const currentIdx = sources.findIndex(s => s.id === editorState.activeSourceId);
    const nextIdx = direction === 'next' ? currentIdx + 1 : currentIdx - 1;
    if (nextIdx >= 0 && nextIdx < sources.length) {
      const nextSource = sources[nextIdx];
      const nextLine = nextSource.lines[0];
      editorDispatch({
        type: 'LOAD_SOURCE',
        payload: {
          sourceId: nextSource.id,
          lineId: nextLine?.id ?? '',
          initialDividers: nextLine?.dividers ?? [],
          syllableRange: nextLine?.syllableRange ?? { start: 0, end: Math.max(0, totalSyllableCount - 1) },
          gaps: nextLine?.gaps ?? [],
        },
      });
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    if (e.key === 'Tab' && !e.ctrlKey) {
      e.preventDefault();
      navigateSource(e.shiftKey ? 'prev' : 'next');
    }
    if (e.key === 'Enter' && e.ctrlKey) {
      e.preventDefault();
      navigateSource('next');
    }
  }

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
    <div
      className="flex h-full focus:outline-none"
      tabIndex={0}
      onKeyDown={handleKeyDown}
    >
      {/* Left sidebar */}
      <SourceSidebar
        sources={project.sources}
        activeSourceId={editorState.activeSourceId}
        totalSyllableCount={totalSyllableCount}
        onSelectSource={(id) =>
          editorDispatch({
            type: 'LOAD_SOURCE',
            payload: {
              sourceId: id,
              lineId: project.sources.find(s => s.id === id)?.lines[0]?.id ?? '',
              initialDividers: project.sources.find(s => s.id === id)?.lines[0]?.dividers ?? [],
              syllableRange:
                project.sources.find(s => s.id === id)?.lines[0]?.syllableRange ??
                { start: 0, end: Math.max(0, totalSyllableCount - 1) },
              gaps: project.sources.find(s => s.id === id)?.lines[0]?.gaps ?? [],
            },
          })
        }
      />

      {/* Main panel */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top bar */}
        <div className="flex items-center justify-between px-4 py-2 border-b border-gray-200 bg-white flex-shrink-0">
          <span className="text-sm font-medium text-gray-700 truncate">
            {activeSource?.metadata.siglum ?? 'Nenhuma fonte selecionada'}
          </span>
          <div className="flex gap-2">
            <button
              type="button"
              className="px-3 py-1.5 text-xs bg-gray-100 hover:bg-gray-200 rounded border border-gray-300"
              onClick={() => editorDispatch({ type: 'AUTO_DISTRIBUTE' })}
              disabled={!hasImage}
            >
              Auto-distribuir
            </button>
            <button
              type="button"
              className="px-3 py-1.5 text-xs bg-red-50 hover:bg-red-100 text-red-700 rounded border border-red-300"
              onClick={handleClear}
              disabled={!hasImage}
            >
              Limpar
            </button>
            <button
              type="button"
              className="px-3 py-1.5 text-xs bg-green-600 hover:bg-green-700 text-white rounded disabled:opacity-40"
              onClick={handleConfirm}
              disabled={!hasImage || isConfirming || !editorState.syllableRange}
            >
              {isConfirming ? 'Confirmando…' : 'Confirmar recortes'}
            </button>
          </div>
        </div>

        {/* Syllable range bar */}
        <div className="flex-shrink-0 border-b border-gray-100 bg-gray-50 px-3 py-1">
          <SyllableRangeBar
            words={project.text.words}
            syllableRange={editorState.syllableRange}
            gaps={editorState.gaps}
            hoveredSyllableIdx={editorState.hoveredSyllableIdx}
            onRangeChange={(range) => editorDispatch({ type: 'SET_RANGE', payload: range })}
            onGapToggle={(idx) => editorDispatch({ type: 'TOGGLE_GAP', payload: idx })}
            onHover={(idx) => editorDispatch({ type: 'SET_HOVER', payload: idx })}
          />
        </div>

        {/* Image canvas (main area) or drop zone */}
        <div className="flex-1 min-h-0">
          {hasImage && activeLine ? (
            <ImageCanvas
              image={activeLine.image}
              dividers={editorState.dividers}
              syllableRange={editorState.syllableRange}
              gaps={editorState.gaps}
              hoveredSyllableIdx={editorState.hoveredSyllableIdx}
              zoom={editorState.zoom}
              panOffset={editorState.panOffset}
              dispatch={editorDispatch}
            />
          ) : (
            // TODO: DropZone — filled in by Task 1b
            <DropZone onImageLoaded={applyImageToSource} activeSource={activeSource} />
          )}
        </div>

        {/* Slice preview strip */}
        <div className="flex-shrink-0 max-h-36 border-t border-gray-200">
          <SlicePreview
            image={activeLine?.image ?? null}
            words={project.text.words}
            dividers={editorState.dividers}
            syllableRange={editorState.syllableRange}
            gaps={editorState.gaps}
            hoveredSyllableIdx={editorState.hoveredSyllableIdx}
            onHover={(idx) => editorDispatch({ type: 'SET_HOVER', payload: idx })}
          />
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
// TODO: DropZone — placeholder; filled in by Task 1b

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
