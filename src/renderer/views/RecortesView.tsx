// src/renderer/views/RecortesView.tsx
//
// Vista Recortes. O projeto é a fonte única das caixas, do intervalo e dos gaps
// (spec D6): a vista os lê a cada render e grava no fim de cada gesto. O estado
// efêmero (seleção, sílaba ativa, zoom, alternâncias) fica no RecortesProvider,
// que a barra de ferramentas e o menu Recortes também leem.

import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useProject } from "../hooks/useProject";
import type { HistoryMeta } from "../history/history";
import type { SyllableRange } from "../hooks/useRecortes";
import { useRecortesCommands, useRecortesContext } from "../hooks/RecortesContext";
import { SourceTree } from "../components/sources/SourceTree";
import { useAddPage, type AddPage } from "../components/sources/useAddPage";
import { ResizeImageDialog } from "../components/sources/ResizeImageDialog";
import { SourceDialog } from "../components/sources/SourceDialog";
import { SyllableStrip } from "../components/recortes/SyllableStrip";
import { ImageCanvas } from "../components/slice-editor/ImageCanvas";
import { RealignBoxesDialog } from "../components/slice-editor/RealignBoxesDialog";
import { Dialog } from "../ui/Dialog";
import { Button } from "../ui/Button";
import { MenuItem, MenuSeparator, MenuSurface } from "../ui/Menu";
import { recortesMenuItems } from "../shell/menus";
import { formatAccelerator } from "../shell/accelerator";
import { flattenSyllables } from "../lib/sliceUtils";
import { boxesInView, hasAnyBox } from "@shared/box-frame";
import type { ImageAdjustments, ManuscriptSource, SyllableBox } from "../lib/models";

/**
 * Global syllables confirmed by OTHER pages of the source, each with the label
 * of the (first) page that covers it: its folio, else its position.
 */
function coveredByOtherPages(
  source: ManuscriptSource,
  excludeLineId: string | null,
  pageLabel: string,
): Map<number, string> {
  const covered = new Map<number, string>();
  source.lines.forEach((line, n) => {
    if (line.id === excludeLineId || !line.confirmed) return;
    const label = line.folio || `${pageLabel} ${n + 1}`;
    for (let i = line.syllableRange.start; i <= line.syllableRange.end; i++) {
      if (!covered.has(i)) covered.set(i, label);
    }
  });
  return covered;
}

/** Alvos cujas teclas não são do editor (atalhos globais Tab/Enter/Delete/setas). */
export function isOutsideEditorKeys(target: Element): boolean {
  if (target.tagName === "BUTTON" || target.tagName === "SELECT") return true;
  return target.closest("[role=menubar],[role=menu],[role=toolbar],[role=dialog],[role=tablist],[role=tree],[role=slider]") !== null;
}

function sameBox(a: SyllableBox | null | undefined, b: SyllableBox | null | undefined): boolean {
  if (!a || !b) return a == b;
  return a.x === b.x && a.y === b.y && a.w === b.w && a.h === b.h;
}

export interface RecortesViewProps {
  /** Fonte recém-criada pela Texto: o diálogo Fonte dela abre ao montar. */
  openSourceId?: string | null;
  onOpenSourceHandled?: () => void;
}

export function RecortesView({ openSourceId = null, onOpenSourceHandled }: RecortesViewProps = {}) {
  const { state, dispatch } = useProject();
  const { t } = useTranslation();
  const project = state.project;
  const recortes = useRecortesContext();
  const commands = useRecortesCommands();
  const [editingSourceId, setEditingSourceId] = useState<string | null>(null);
  useEffect(() => {
    if (!openSourceId) return;
    setEditingSourceId(openSourceId);
    onOpenSourceHandled?.();
  }, [openSourceId, onOpenSourceHandled]);
  const addPage = useAddPage((sourceId, lineId) => recortes.selectLine(sourceId, lineId));
  const [sheetMenu, setSheetMenu] = useState<{ x: number; y: number } | null>(null);

  const words = project?.text.words;
  const total = useMemo(() => (words ? flattenSyllables(words).length : 0), [words]);
  const activeSource = project?.sources.find((s) => s.id === recortes.activeSourceId) ?? null;
  const activeLine = activeSource?.lines.find((l) => l.id === recortes.activeLineId) ?? null;
  const hasImage = !!activeLine?.image;
  // Boxes in the frame the user sees, derived from the project (memo per line:
  // a line object changes whenever its boxes or its frame do).
  const viewBoxes = useMemo(() => (activeLine ? boxesInView(activeLine) : {}), [activeLine]);
  const range: SyllableRange | null = activeLine ? activeLine.syllableRange : null;
  const pageLabel = t("sourceTree.page");
  const covered = useMemo(
    () => (activeSource && activeLine ? coveredByOtherPages(activeSource, activeLine.id, pageLabel) : new Map<number, string>()),
    [activeSource, activeLine, pageLabel],
  );
  const activeSyllable = recortes.activeSyllable;

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

  const sheetMenuItems = recortesMenuItems(commands.state, commands, t);
  const platform = window.mocquereau?.platform ?? "";

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

  // ── Paste (Ctrl+V reads the clipboard through main) ──────────────────────

  const pasteRef = useRef<() => void>(() => {});
  pasteRef.current = () => {
    if (activeSource) void addPage.paste(activeSource.id);
  };
  useEffect(() => {
    const handler = (e: ClipboardEvent) => {
      // Text pasted into a field (the Fólio dialog) is not a page.
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

    // Ctrl+Enter (Próxima fonte) é atalho do menu Recortes.
    if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) return;
    if ((e.key === "Tab" && !e.shiftKey) || e.key === "Enter") {
      e.preventDefault();
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
        <SourceTree onEditSource={setEditingSourceId} />

        <div className="flex min-w-0 flex-1 flex-col">
          {hasImage && activeLine && (
            <div className="flex-shrink-0 px-4 pt-3">
              <SyllableStrip
                words={project.text.words}
                line={activeLine}
                activeSyllable={activeSyllable}
                coveredByOthers={covered}
                onActivate={recortes.setActiveSyllable}
                onRangeChange={setRange}
                onToggleGap={toggleGap}
                onRemoveBox={deleteBox}
              />
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
                drawMode={recortes.drawMode}
                adjustments={activeLine?.imageAdjustments}
                onUpdateAdjustments={handleUpdateAdjustments}
                onContextMenu={(e) => {
                  e.preventDefault();
                  setSheetMenu({ x: e.clientX, y: e.clientY });
                }}
              />
            ) : (
              <DropZone activeSource={activeSource} addPage={addPage} />
            )}
          </div>
        </div>
        {sheetMenu && (
          <MenuSurface
            aria-label={t("shell.view.recortes")}
            className="fixed z-[130]"
            style={{ left: sheetMenu.x, top: sheetMenu.y }}
            onClose={() => setSheetMenu(null)}
          >
            {sheetMenuItems.map((item, i) =>
              item === "separator" ? (
                <MenuSeparator key={`sep-${i}`} />
              ) : (
                <MenuItem
                  key={item.id}
                  label={item.label}
                  shortcut={item.accelerator ? formatAccelerator(item.accelerator, platform) : undefined}
                  disabled={item.disabled}
                  onSelect={item.onSelect}
                />
              ),
            )}
          </MenuSurface>
        )}
        <RealignBoxesDialog open={recortes.dialog === "realign"} line={activeLine} onClose={() => recortes.setDialog(null)} />
        <Dialog
          open={recortes.dialog === "clearPage"}
          title={t("recortes.clearPage.title")}
          onClose={() => recortes.setDialog(null)}
          actions={
            <>
              <Button variant="elevated" data-autofocus onClick={() => recortes.setDialog(null)}>
                {t("recortes.clearPage.cancel")}
              </Button>
              <Button
                variant="danger"
                onClick={() => {
                  recortes.setDialog(null);
                  commands.clearActivePage();
                }}
              >
                {t("recortes.clearPage.confirm")}
              </Button>
            </>
          }
        >
          {t("recortes.clearPage.body")}
        </Dialog>
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
