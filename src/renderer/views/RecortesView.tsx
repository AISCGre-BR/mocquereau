// src/renderer/views/RecortesView.tsx
//
// Vista Recortes. O projeto é a fonte única das caixas, do intervalo e dos gaps
// (spec D6): a vista os lê a cada render e grava no fim de cada gesto. O estado
// efêmero (seleção, sílaba ativa, zoom, alternâncias) fica em useRecortes.

import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { SlidersHorizontal } from "lucide-react";
import { useProject } from "../hooks/useProject";
import type { HistoryMeta } from "../history/history";
import { useRecortes, type SyllableRange } from "../hooks/useRecortes";
import { SourceTree } from "../components/sources/SourceTree";
import { useAddPage, type AddPage } from "../components/sources/useAddPage";
import { ResizeImageDialog } from "../components/sources/ResizeImageDialog";
import { SourceDialog } from "../components/sources/SourceDialog";
import { SyllableRangeBar } from "../components/slice-editor/SyllableRangeBar";
import { ImageCanvas } from "../components/slice-editor/ImageCanvas";
import { RealignBoxesDialog } from "../components/slice-editor/RealignBoxesDialog";
import { flattenSyllables } from "../lib/sliceUtils";
import { boxesInView, hasAnyBox } from "@shared/box-frame";
import type { ImageAdjustments, ManuscriptSource, SyllableBox } from "../lib/models";

/** Global syllable indices confirmed by OTHER pages of the source. */
function computeCoveredSyllables(source: ManuscriptSource, excludeLineId: string | null): number[] {
  const covered = new Set<number>();
  for (const line of source.lines) {
    if (line.id === excludeLineId || !line.confirmed) continue;
    for (let i = line.syllableRange.start; i <= line.syllableRange.end; i++) covered.add(i);
  }
  return Array.from(covered);
}

/** Alvos cujas teclas não são do editor (atalhos globais Tab/Enter/Delete/setas). */
export function isOutsideEditorKeys(target: Element): boolean {
  if (target.tagName === "BUTTON" || target.tagName === "SELECT") return true;
  return target.closest("[role=menubar],[role=menu],[role=toolbar],[role=dialog],[role=tablist],[role=tree]") !== null;
}

function sameBox(a: SyllableBox | null | undefined, b: SyllableBox | null | undefined): boolean {
  if (!a || !b) return a == b;
  return a.x === b.x && a.y === b.y && a.w === b.w && a.h === b.h;
}

export function RecortesView() {
  const { state, dispatch } = useProject();
  const { t } = useTranslation();
  const project = state.project;
  const recortes = useRecortes(project);
  const [editingSourceId, setEditingSourceId] = useState<string | null>(null);
  const addPage = useAddPage((sourceId, lineId) => recortes.selectLine(sourceId, lineId));
  const [hoveredSyllable, setHoveredSyllable] = useState<number | null>(null);
  const [showRealign, setShowRealign] = useState(false);

  const words = project?.text.words;
  const total = useMemo(() => (words ? flattenSyllables(words).length : 0), [words]);
  const activeSource = project?.sources.find((s) => s.id === recortes.activeSourceId) ?? null;
  const activeLine = activeSource?.lines.find((l) => l.id === recortes.activeLineId) ?? null;
  const hasImage = !!activeLine?.image;
  // Boxes in the frame the user sees, derived from the project (memo per line:
  // a line object changes whenever its boxes or its frame do).
  const viewBoxes = useMemo(() => (activeLine ? boxesInView(activeLine) : {}), [activeLine]);
  const range: SyllableRange | null = activeLine ? activeLine.syllableRange : null;
  const covered = useMemo(
    () => (activeSource && activeLine ? computeCoveredSyllables(activeSource, activeLine.id) : []),
    [activeSource, activeLine],
  );
  const activeSyllable = recortes.activeSyllable;
  const activeSyllableLabel =
    words && activeSyllable !== null ? (flattenSyllables(words)[activeSyllable] ?? null) : null;

  // ── Writes to the project (end of each gesture) ──────────────────────────

  function writeBoxes(boxes: Record<number, SyllableBox | null>, meta?: HistoryMeta) {
    if (!activeSource || !activeLine) return;
    dispatch({
      type: "UPDATE_LINE_BOXES",
      payload: {
        sourceId: activeSource.id,
        lineId: activeLine.id,
        syllableBoxes: boxes,
        confirmed: hasAnyBox(boxes),
      },
      ...(meta ? { meta } : {}),
    });
  }

  function commitBox(idx: number, box: SyllableBox, meta?: HistoryMeta) {
    if (sameBox(viewBoxes[idx], box)) return; // a click without moving is no edit
    writeBoxes({ ...viewBoxes, [idx]: box }, meta);
  }

  function deleteBox(idx: number) {
    if (viewBoxes[idx] == null) return;
    writeBoxes({ ...viewBoxes, [idx]: null });
  }

  function setRange(next: SyllableRange) {
    if (!activeSource || !activeLine) return;
    dispatch({
      type: "SET_LINE_RANGE",
      payload: { sourceId: activeSource.id, lineId: activeLine.id, range: next },
    });
  }

  function toggleGap(idx: number) {
    if (!activeSource || !activeLine) return;
    const gaps = activeLine.gaps.includes(idx)
      ? activeLine.gaps.filter((g) => g !== idx)
      : [...activeLine.gaps, idx];
    dispatch({ type: "SET_LINE_GAPS", payload: { sourceId: activeSource.id, lineId: activeLine.id, gaps } });
  }

  function handleUpdateAdjustments(partial: Partial<ImageAdjustments>) {
    if (!activeSource || !activeLine) return;
    dispatch({
      type: "UPDATE_LINE_ADJUSTMENTS",
      payload: { sourceId: activeSource.id, lineId: activeLine.id, adjustments: partial },
    });
  }

  function handleClear() {
    if (!activeSource) return;
    const lines = activeSource.lines.map((l) => ({
      ...l,
      dividers: [],
      gaps: [],
      syllableBoxes: {},
      confirmed: false,
    }));
    dispatch({ type: "UPDATE_SOURCE", payload: { ...activeSource, syllableCuts: {}, lines } });
    recortes.setActiveSyllable(null);
  }

  function nextSource() {
    if (!project) return;
    const idx = project.sources.findIndex((s) => s.id === recortes.activeSourceId);
    const next = project.sources[idx + 1];
    if (next) recortes.selectSource(next.id);
  }

  // ── Paste (Ctrl+V reads the clipboard through main) ──────────────────────

  const pasteRef = useRef<() => void>(() => {});
  pasteRef.current = () => {
    if (activeSource) void addPage.paste(activeSource.id);
  };
  useEffect(() => {
    const handler = (e: ClipboardEvent) => {
      // Text pasted into a field (the Fólio dialog, the range inputs) is not a page.
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable)) return;
      if (target instanceof Element && target.closest("[role=dialog]")) return;
      pasteRef.current();
    };
    window.addEventListener("paste", handler);
    return () => window.removeEventListener("paste", handler);
  }, []);

  // ── Keyboard (window listener: focus is often on the image or a label) ───

  const keyRef = useRef<(e: KeyboardEvent) => void>(() => {});
  keyRef.current = (e: KeyboardEvent) => {
    const target = e.target as HTMLElement | null;
    if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable)) return;
    // Teclas da casca e de controles nativos ficam com eles.
    if (target instanceof Element && isOutsideEditorKeys(target)) return;
    if (!range) return;
    const active = recortes.activeSyllable;

    if ((e.key === "Tab" && !e.shiftKey) || e.key === "Enter") {
      e.preventDefault();
      if (e.key === "Enter" && e.ctrlKey) {
        nextSource();
        return;
      }
      // Tab/Enter avança a sílaba ativa; além do fim, estende o intervalo da página.
      if (active === null) {
        recortes.setActiveSyllable(range.start);
        return;
      }
      const next = active + 1;
      if (next >= total) return;
      recortes.setActiveSyllable(next);
      if (next > range.end) setRange({ start: range.start, end: next });
      return;
    }

    if (e.key === "Tab" && e.shiftKey) {
      e.preventDefault();
      if (active === null) {
        recortes.setActiveSyllable(range.end);
        return;
      }
      const prev = active - 1;
      if (prev < 0) return;
      recortes.setActiveSyllable(prev);
      if (prev < range.start) setRange({ start: prev, end: range.end });
      return;
    }

    if ((e.key === "Delete" || e.key === "Backspace") && active !== null) {
      if (viewBoxes[active] != null) {
        e.preventDefault();
        deleteBox(active);
      }
      return;
    }

    // Setas: movem a caixa ativa 1 px (Shift: 10 px); setas seguidas são um passo de desfazer.
    if (["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(e.key) && active !== null) {
      const box = viewBoxes[active];
      if (!box || !activeLine) return;
      e.preventDefault();
      const img = document.querySelector<HTMLElement>("[data-image-wrapper]");
      if (!img) return;
      const rect = img.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) return;
      const pixels = e.shiftKey ? 10 : 1;
      let { x, y } = box;
      if (e.key === "ArrowLeft") x -= pixels / rect.width;
      if (e.key === "ArrowRight") x += pixels / rect.width;
      if (e.key === "ArrowUp") y -= pixels / rect.height;
      if (e.key === "ArrowDown") y += pixels / rect.height;
      x = Math.max(0, Math.min(1 - box.w, x));
      y = Math.max(0, Math.min(1 - box.h, y));
      commitBox(active, { ...box, x, y }, { coalesceKey: `UPDATE_LINE_BOXES:${activeLine.id}:${active}:nudge` });
    }
  };
  useEffect(() => {
    const handler = (e: KeyboardEvent) => keyRef.current(e);
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  if (!project) {
    return <div className="flex h-full items-center justify-center text-ink-muted">{t("sliceEditor.empty")}</div>;
  }

  return (
    <div className="flex min-h-0 flex-1">
      <div className="flex min-h-0 min-w-0 flex-1 focus:outline-none">
        <SourceTree recortes={recortes} onEditSource={setEditingSourceId} />

        <div className="flex min-w-0 flex-1 flex-col">
          <div className="flex flex-shrink-0 items-center justify-between border-b border-rule-soft bg-surface px-4 py-2">
            <span className="truncate text-sm font-medium text-ink-soft">
              {activeSource?.metadata.siglum ?? t("sliceEditor.noSourceSelected")}
            </span>
            <div className="flex items-center gap-3">
              <span className="text-xs text-ink-muted">{t("sliceEditor.autoSaved")}</span>
              <button
                type="button"
                className="flex items-center gap-1.5 rounded border border-rubric bg-rubric-wash px-3 py-1.5 text-xs text-rubric hover:bg-rubric-wash disabled:opacity-40"
                onClick={() => recortes.setImagePanelOpen(!recortes.imagePanelOpen)}
                disabled={!hasImage}
                title={t("sliceEditor.adjustmentsTitle")}
                aria-pressed={recortes.imagePanelOpen}
              >
                <SlidersHorizontal size={14} />
                {t("sliceEditor.adjustments")}
              </button>
              <button
                type="button"
                className="rounded border border-warning bg-orpiment-wash px-3 py-1.5 text-xs text-warning hover:bg-orpiment-wash disabled:opacity-40"
                onClick={() => activeSyllable !== null && deleteBox(activeSyllable)}
                disabled={!hasImage || activeSyllable === null || viewBoxes[activeSyllable] == null}
                title={t("sliceEditor.removeActiveBoxTitle")}
              >
                {t("sliceEditor.removeBox")}
              </button>
              <button
                type="button"
                className="rounded border border-danger bg-rubric-wash px-3 py-1.5 text-xs text-danger hover:bg-rubric-wash"
                onClick={handleClear}
                disabled={!hasImage}
              >
                {t("sliceEditor.clearAll")}
              </button>
            </div>
          </div>

          {hasImage && range && (
            <div className="flex-shrink-0 border-b border-rule-soft bg-surface px-3 py-2">
              <div className="mb-2 flex items-center gap-3">
                <span className="text-xs font-medium text-ink-muted">{t("sliceEditor.range")}</span>
                <label className="flex items-center gap-1 text-xs text-ink-soft">
                  {t("sliceEditor.from")}
                  <input
                    type="number"
                    min={0}
                    max={total - 1}
                    value={range.start}
                    onChange={(e) => {
                      const val = parseInt(e.target.value, 10);
                      if (!isNaN(val)) setRange({ start: Math.min(val, range.end), end: range.end });
                    }}
                    className="w-14 rounded border border-rule px-1 py-0.5 text-center text-xs"
                  />
                </label>
                <label className="flex items-center gap-1 text-xs text-ink-soft">
                  {t("sliceEditor.to")}
                  <input
                    type="number"
                    min={0}
                    max={total - 1}
                    value={range.end}
                    onChange={(e) => {
                      const val = parseInt(e.target.value, 10);
                      if (!isNaN(val)) setRange({ start: range.start, end: Math.max(val, range.start) });
                    }}
                    className="w-14 rounded border border-rule px-1 py-0.5 text-center text-xs"
                  />
                </label>
              </div>
              <SyllableRangeBar
                words={project.text.words}
                syllableRange={range}
                gaps={activeLine!.gaps}
                hoveredSyllableIdx={hoveredSyllable}
                activeSyllableIdx={activeSyllable}
                coveredSyllables={covered}
                onRangeChange={setRange}
                onGapToggle={toggleGap}
                onHover={setHoveredSyllable}
                onRename={(globalIdx, newText) => {
                  let offset = 0;
                  for (let w = 0; w < project.text.words.length; w++) {
                    const len = project.text.words[w].syllables.length;
                    if (globalIdx < offset + len) {
                      dispatch({
                        type: "UPDATE_SYLLABLE_TEXT",
                        payload: { wordIdx: w, sylIdx: globalIdx - offset, newText },
                      });
                      return;
                    }
                    offset += len;
                  }
                }}
              />
            </div>
          )}

          {hasImage && (
            <div className="flex flex-shrink-0 items-center justify-between gap-3 border-b border-rubric-soft bg-rubric-wash px-4 py-2 text-xs text-rubric">
              <div className="flex min-w-0 items-center gap-3">
                {activeSyllableLabel !== null ? (
                  <span className="flex items-center gap-2">
                    <span className="text-ink-soft">{t("sliceEditor.markingAreaFor")}</span>
                    <span className="inline-block rounded bg-rubric px-2 py-0.5 font-mono text-sm font-bold text-on-rubric">
                      {activeSyllableLabel}
                    </span>
                    <span className="hidden text-ink-muted md:inline">{t("sliceEditor.markingHint")}</span>
                  </span>
                ) : (
                  <span className="text-ink-soft">
                    <span className="font-medium">{t("sliceEditor.clickSyllableAbove")}</span>{" "}
                    {t("sliceEditor.clickSyllableAboveSuffix")}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-4">
                <label className="flex cursor-pointer items-center gap-2 whitespace-nowrap">
                  <input
                    type="checkbox"
                    checked={recortes.sameSize}
                    onChange={(e) => recortes.setSameSize(e.target.checked)}
                    className="h-4 w-4"
                  />
                  <span className="font-medium">{t("sliceEditor.sameSizeAsFirst")}</span>
                </label>
                <label className="flex cursor-pointer items-center gap-2 whitespace-nowrap">
                  <input
                    type="checkbox"
                    checked={recortes.showAll}
                    onChange={(e) => recortes.setShowAll(e.target.checked)}
                    className="h-4 w-4"
                  />
                  <span className="font-medium">{t("sliceEditor.showAllBoxes")}</span>
                </label>
              </div>
            </div>
          )}

          <div className="min-h-0 flex-1">
            {hasImage ? (
              <ImageCanvas
                image={activeLine!.image}
                syllableBoxes={viewBoxes}
                activeSyllableIdx={activeSyllable}
                syllableRange={range}
                zoom={recortes.zoom}
                onZoomChange={recortes.setZoom}
                onActivateSyllable={recortes.setActiveSyllable}
                onBoxCommit={(idx, box) => commitBox(idx, box)}
                words={project.text.words}
                showAllBoxes={recortes.showAll}
                sameSizeMode={recortes.sameSize}
                adjustments={activeLine?.imageAdjustments}
                panelOpen={recortes.imagePanelOpen}
                onUpdateAdjustments={handleUpdateAdjustments}
                onClosePanel={() => recortes.setImagePanelOpen(false)}
                onRealign={hasAnyBox(activeLine?.syllableBoxes) ? () => setShowRealign(true) : undefined}
              />
            ) : (
              <DropZone activeSource={activeSource} addPage={addPage} />
            )}
          </div>
        </div>
        <RealignBoxesDialog open={showRealign} line={activeLine} onClose={() => setShowRealign(false)} />
        <ResizeImageDialog addPage={addPage} />
        {editingSourceId && <SourceDialog sourceId={editingSourceId} onClose={() => setEditingSourceId(null)} />}
      </div>
    </div>
  );
}

// ── DropZone ──────────────────────────────────────────────────────────────────

function DropZone({ activeSource, addPage }: { activeSource: ManuscriptSource | null; addPage: AddPage }) {
  const { t } = useTranslation();
  function handleImageDrop(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (activeSource && file) void addPage.dropFile(activeSource.id, file);
  }

  return (
    <div
      className="m-4 flex flex-1 flex-col items-center justify-center gap-3 rounded-lg border-2 border-dashed border-rule text-ink-muted"
      onDragOver={(e) => e.preventDefault()}
      onDrop={handleImageDrop}
    >
      <p className="text-sm">{t("sliceEditor.dropZone.dragImage")}</p>
      <p className="text-xs">{t("sliceEditor.dropZone.or")}</p>
      <button
        type="button"
        className="rounded bg-rubric px-3 py-1.5 text-sm text-on-rubric hover:bg-rubric-soft"
        onClick={() => activeSource && void addPage.openFile(activeSource.id)}
      >
        {t("sliceEditor.dropZone.selectFile")}
      </button>
      <p className="text-xs">{t("sliceEditor.dropZone.paste")}</p>
    </div>
  );
}
