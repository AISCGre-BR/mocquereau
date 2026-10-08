import { useState, useEffect, useRef } from "react";
import {
  ArrowUp,
  ArrowDown,
  Trash2,
  Copy,
  Edit2,
  ImagePlus,
  Plus,
} from "lucide-react";
import { useProject } from "../hooks/useProject";
import { fileToDataUrl, resizeImageIfNeeded } from "../lib/image-utils";
import type { ManuscriptSource, StoredImage } from "../lib/models";
import { SourceModal } from "./SourceModal";
import { appendLineConsumingFolioHint } from "../lib/tableUtils";
import { createEmptySource, guerangerToSource, suggestRangeForNewPage } from "../lib/sources";
import { useTranslation } from "react-i18next";

// ── Types ─────────────────────────────────────────────────────────────────────

// ── Constants ─────────────────────────────────────────────────────────────────

// ── Helpers ───────────────────────────────────────────────────────────────────

function getFirstImage(source: ManuscriptSource): StoredImage | null {
  return source.lines[0]?.image ?? null;
}

/** Number of lines with a loaded image (used to show count badge when > 1). */
function getImageCount(source: ManuscriptSource): number {
  return source.lines.filter((l) => l.image?.dataUrl).length;
}

// ── Component ─────────────────────────────────────────────────────────────────

export function SourceList() {
  const { state, dispatch } = useProject();
  const { t } = useTranslation();

  const sources = state.project?.sources ?? [];
  const level1 = state.project?.classification[0] ?? { name: "", values: [] };
  const totalSyllables =
    state.project?.text.words.flatMap((w) => w.syllables).length ?? 0;

  // ── Local state ────────────────────────────────────────────────────────────
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editingSource, setEditingSource] = useState<ManuscriptSource | null>(null);
  const [resizeCandidate, setResizeCandidate] = useState<{
    image: StoredImage;
    sourceId: string;
  } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const lastAddedRef = useRef<string | null>(null);

  // Auto-add first source row when entering with no sources (guarded by ref to prevent
  // double-add in React 19 StrictMode + re-renders caused by dispatched ADD_SOURCE)
  const hasAutoAddedRef = useRef(false);
  useEffect(() => {
    if (state.project && sources.length === 0 && !hasAutoAddedRef.current) {
      hasAutoAddedRef.current = true;
      handleAddSource();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.project, sources.length]);

  // Auto-focus siglum input when a new source is added
  useEffect(() => {
    if (lastAddedRef.current) {
      const input = document.querySelector(
        `[data-source-id="${lastAddedRef.current}"] input[data-field="siglum"]`
      ) as HTMLInputElement | null;
      input?.focus();
      lastAddedRef.current = null;
    }
  });

  // ── Image handling ─────────────────────────────────────────────────────────

  function applyImageToSource(image: StoredImage, sourceId: string) {
    const source = sources.find((s) => s.id === sourceId);
    if (!source) return;
    // Append new line (preserves existing images — SRC-06 multi-image support).
    // If source had no lines yet, this creates the first; otherwise, adds another.
    const newLine = {
      id: crypto.randomUUID(),
      image,
      syllableRange: suggestRangeForNewPage(source, totalSyllables),
      dividers: [],
      gaps: [],
      confirmed: false,
    };
    dispatch({ type: "UPDATE_SOURCE", payload: appendLineConsumingFolioHint(source, newLine) });
  }

  async function handleImageLoaded(
    raw: { dataUrl: string; width: number; height: number },
    sourceId: string
  ) {
    const mimeType = raw.dataUrl.split(";")[0].split(":")[1] || "image/png";
    const image: StoredImage = { ...raw, mimeType };
    if (image.width > 2000) {
      setResizeCandidate({ image, sourceId });
      return;
    }
    applyImageToSource(image, sourceId);
  }

  // ── Keyboard paste (Ctrl+V pastes into selected row) ──────────────────────

  useEffect(() => {
    async function onKeyDown(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key === "v" && selectedId) {
        const result = await window.mocquereau.readClipboardImage();
        if (result) await handleImageLoaded(result, selectedId);
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId, sources]);

  // ── Source actions ─────────────────────────────────────────────────────────

  function handleAddSource() {
    const newSource = createEmptySource();
    dispatch({ type: "ADD_SOURCE", payload: newSource });
    setSelectedId(newSource.id);
    lastAddedRef.current = newSource.id;
  }

  function handleDeleteSource(id: string) {
    dispatch({ type: "REMOVE_SOURCE", payload: id });
    if (selectedId === id) setSelectedId(null);
  }

  function handleDuplicateSource(id: string) {
    dispatch({ type: "DUPLICATE_SOURCE", payload: id });
  }

  function handleReorder(id: string, direction: "up" | "down") {
    dispatch({ type: "REORDER_SOURCE", payload: { id, direction } });
  }

  function handleFieldBlur(
    source: ManuscriptSource,
    field: keyof ManuscriptSource["metadata"],
    value: string
  ) {
    const updated: ManuscriptSource = {
      ...source,
      metadata: { ...source.metadata, [field]: value },
    };
    dispatch({ type: "UPDATE_SOURCE", payload: updated });
  }

  function handleLevel1Change(source: ManuscriptSource, value: string) {
    const classes: ManuscriptSource["metadata"]["classes"] = [value || null, source.metadata.classes[1], source.metadata.classes[2]];
    dispatch({
      type: "UPDATE_SOURCE",
      payload: { ...source, metadata: { ...source.metadata, classes } },
    });
  }

  async function handleImportGueranger() {
    const result = await window.mocquereau.importGueranger();
    if (!result) return;
    result.manuscripts.forEach((gm, i) => {
      const source = guerangerToSource(gm, sources.length + i + 1);
      dispatch({ type: "ADD_SOURCE", payload: source });
    });
  }

  // ── Image cell actions ────────────────────────────────────────────────────

  async function handleImageCellClick(sourceId: string) {
    setSelectedId(sourceId);
    const result = await window.mocquereau.openImageFile();
    if (result) await handleImageLoaded(result, sourceId);
  }

  async function handleImageCellDrop(e: React.DragEvent, sourceId: string) {
    e.preventDefault();
    e.stopPropagation();
    const file = e.dataTransfer.files[0];
    if (!file) return;
    const image = await fileToDataUrl(file);
    await handleImageLoaded(
      { dataUrl: image.dataUrl, width: image.width, height: image.height },
      sourceId
    );
  }

  function getProgress(source: ManuscriptSource): number {
    return Object.values(source.syllableCuts).filter(
      (c) => c !== null && c !== undefined
    ).length;
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col">
      <div className="flex-1 w-full px-4 py-4 space-y-3">
        {/* Header + toolbar */}
        <div className="flex items-center justify-between">
          <h1 className="text-lg font-bold text-ink">
            {t("sourceList.title")}
            {sources.length > 0 && (
              <span className="ml-2 text-sm font-normal text-ink-muted">
                ({sources.length})
              </span>
            )}
          </h1>
          <div className="flex gap-2">
            <button
              onClick={handleImportGueranger}
              className="px-3 py-1.5 text-xs text-ink-soft border border-rule rounded hover:bg-ink-wash"
            >
              {t("sourceList.importGueranger")}
            </button>
            <button
              onClick={handleAddSource}
              disabled={!state.project}
              className="flex items-center gap-1 px-3 py-1.5 text-xs bg-rubric text-on-rubric rounded hover:bg-rubric-soft disabled:opacity-40"
            >
              <Plus size={12} />
              {t("sourceList.add")}
            </button>
          </div>
        </div>

        {/* Spreadsheet-style table */}
        {sources.length === 0 ? (
          <div className="bg-surface rounded border border-rule-soft p-8 text-center">
            <p className="text-ink-muted text-sm">
              {t("sourceList.empty")}
            </p>
          </div>
        ) : (
          <div className="bg-surface rounded border border-rule-soft overflow-x-auto">
            <table className="w-full text-xs border-collapse">
              <thead>
                <tr className="border-b border-rule-soft bg-parchment text-ink-muted font-medium">
                  <th className="px-1 py-1.5 w-10 text-center">#</th>
                  <th className="px-2 py-1.5 text-left">Sigla</th>
                  <th className="px-2 py-1.5 text-left">Cidade</th>
                  <th className="px-2 py-1.5 text-left w-16">{t("sourceList.centuryHeader")}</th>
                  <th className="px-2 py-1.5 text-left w-24">{level1.name}</th>
                  <th className="px-2 py-1.5 text-center w-14">{t("sourceList.progressHeader")}</th>
                  <th className="px-2 py-1.5 text-center w-16">{t("sourceList.imageHeader")}</th>
                  <th className="px-1 py-1.5 w-24 text-center">{t("sourceList.actionsHeader")}</th>
                </tr>
              </thead>
              <tbody>
                {sources.map((source, idx) => {
                  const isSelected = selectedId === source.id;
                  const isFirst = idx === 0;
                  const isLast = idx === sources.length - 1;
                  const progress = getProgress(source);
                  const img = getFirstImage(source);
                  const imageCount = getImageCount(source);

                  return (
                    <tr
                      key={source.id}
                      data-source-id={source.id}
                      onClick={() => setSelectedId(source.id)}
                      className={[
                        "border-b border-rule-soft transition-colors",
                        isSelected
                          ? "bg-rubric-wash ring-1 ring-inset ring-focus"
                          : "hover:bg-ink-wash",
                      ].join(" ")}
                    >
                      {/* Row number */}
                      <td className="px-1 py-1 text-center text-ink-muted font-mono">
                        {idx + 1}
                      </td>

                      {/* Siglum */}
                      <td className="px-2 py-1" onClick={(e) => e.stopPropagation()}>
                        <input
                          type="text"
                          data-field="siglum"
                          defaultValue={source.metadata.siglum}
                          onBlur={(e) => handleFieldBlur(source, "siglum", e.target.value)}
                          onFocus={() => setSelectedId(source.id)}
                          placeholder={t("sourceList.siglumPlaceholder")}
                          className="w-full bg-transparent border-b border-transparent hover:border-rule focus:border-rubric outline-none py-0.5 text-xs font-mono"
                        />
                      </td>

                      {/* City */}
                      <td className="px-2 py-1" onClick={(e) => e.stopPropagation()}>
                        <input
                          type="text"
                          defaultValue={source.metadata.city}
                          onBlur={(e) => handleFieldBlur(source, "city", e.target.value)}
                          onFocus={() => setSelectedId(source.id)}
                          placeholder={t("sourceList.cityPlaceholder")}
                          className="w-full bg-transparent border-b border-transparent hover:border-rule focus:border-rubric outline-none py-0.5 text-xs"
                        />
                      </td>

                      {/* Century */}
                      <td className="px-2 py-1" onClick={(e) => e.stopPropagation()}>
                        <input
                          type="text"
                          defaultValue={source.metadata.century}
                          onBlur={(e) => handleFieldBlur(source, "century", e.target.value)}
                          onFocus={() => setSelectedId(source.id)}
                          placeholder={t("sourceList.centuryPlaceholder")}
                          className="w-full bg-transparent border-b border-transparent hover:border-rule focus:border-rubric outline-none py-0.5 text-xs"
                        />
                      </td>

                      {/* Classification level 1 */}
                      <td className="px-2 py-1" onClick={(e) => e.stopPropagation()}>
                        <select
                          value={source.metadata.classes[0] ?? ""}
                          onChange={(e) => handleLevel1Change(source, e.target.value)}
                          onFocus={() => setSelectedId(source.id)}
                          className="text-xs rounded px-1 py-0.5 border-0 bg-parchment-deep text-ink cursor-pointer focus:outline-none focus:ring-1 focus:ring-focus"
                        >
                          <option value="">—</option>
                          {level1.values.map((v) => (
                            <option key={v.id} value={v.id}>
                              {v.name}
                            </option>
                          ))}
                        </select>
                      </td>

                      {/* Progress */}
                      <td className="px-2 py-1 text-center text-ink-muted tabular-nums">
                        {progress}/{totalSyllables}
                      </td>

                      {/* Image thumbnail + count + add-more affordance */}
                      <td
                        className="px-2 py-1 text-center"
                        onClick={(e) => {
                          e.stopPropagation();
                          if (!img) handleImageCellClick(source.id);
                        }}
                        onDragOver={(e) => {
                          e.preventDefault();
                          e.dataTransfer.dropEffect = "copy";
                        }}
                        onDrop={(e) => handleImageCellDrop(e, source.id)}
                      >
                        {img ? (
                          <div className="inline-flex items-center gap-1">
                            <img
                              src={img.dataUrl}
                              alt=""
                              className="h-6 max-w-12 object-contain inline-block rounded"
                              title={t("sourceList.firstImageTitle", { width: img.width, height: img.height })}
                            />
                            {imageCount > 1 && (
                              <span
                                className="text-[10px] font-mono px-1 py-0.5 bg-parchment-deep text-ink-soft rounded"
                                title={t("sourceList.imageCountTitle", { count: imageCount })}
                              >
                                +{imageCount - 1}
                              </span>
                            )}
                            <button
                              className="p-0.5 rounded text-rubric hover:text-rubric hover:bg-rubric-wash transition-colors"
                              title={t("sourceList.addAnotherImage")}
                              onClick={(e) => {
                                e.stopPropagation();
                                handleImageCellClick(source.id);
                              }}
                            >
                              <ImagePlus size={12} />
                            </button>
                          </div>
                        ) : (
                          <button
                            className="flex items-center gap-1 px-2 py-0.5 text-xs text-rubric bg-rubric-wash border border-rubric-soft rounded hover:bg-rubric-wash transition-colors"
                            title={t("sourceList.addImageTitle")}
                            onClick={(e) => {
                              e.stopPropagation();
                              handleImageCellClick(source.id);
                            }}
                          >
                            <ImagePlus size={11} />
                            {t("sourceList.imageButton")}
                          </button>
                        )}
                      </td>

                      {/* Actions */}
                      <td className="px-1 py-1" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center justify-center gap-0.5">
                          <button
                            disabled={isFirst}
                            onClick={() => handleReorder(source.id, "up")}
                            className="p-0.5 rounded text-ink-muted hover:text-ink-soft hover:bg-ink-wash disabled:opacity-20 transition-colors"
                            title={t("sourceList.moveUp")}
                          >
                            <ArrowUp size={11} />
                          </button>
                          <button
                            disabled={isLast}
                            onClick={() => handleReorder(source.id, "down")}
                            className="p-0.5 rounded text-ink-muted hover:text-ink-soft hover:bg-ink-wash disabled:opacity-20 transition-colors"
                            title={t("sourceList.moveDown")}
                          >
                            <ArrowDown size={11} />
                          </button>
                          <button
                            onClick={() => setEditingSource(source)}
                            className="p-0.5 rounded text-ink-muted hover:text-ink-soft hover:bg-ink-wash transition-colors"
                            title={t("sourceList.editAll")}
                          >
                            <Edit2 size={11} />
                          </button>
                          <button
                            onClick={() => handleDuplicateSource(source.id)}
                            className="p-0.5 rounded text-ink-muted hover:text-ink-soft hover:bg-ink-wash transition-colors"
                            title={t("sourceList.duplicate")}
                          >
                            <Copy size={11} />
                          </button>
                          <button
                            onClick={() => handleDeleteSource(source.id)}
                            className="p-0.5 rounded text-ink-muted hover:text-danger hover:bg-rubric-wash transition-colors"
                            title={t("sourceList.remove")}
                          >
                            <Trash2 size={11} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        <p className="text-xs text-ink-muted">
          {t("sourceList.clipboardHint")}
        </p>
      </div>

      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/tiff"
        className="hidden"
      />

      {/* Resize confirmation dialog */}
      {resizeCandidate && (
        <div className="fixed inset-0 bg-ink/20 flex items-center justify-center z-50">
          <div className="bg-surface rounded-xl shadow-xl p-6 max-w-sm w-full mx-4 space-y-4">
            <h3 className="text-sm font-semibold text-ink">
              {t("sourceList.largeImageTitle", { width: resizeCandidate.image.width })}
            </h3>
            <p className="text-sm text-ink-soft">
              {t("sourceList.resizeQuestion")}
            </p>
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => setResizeCandidate(null)}
                className="px-3 py-1.5 text-sm text-ink-soft border border-rule rounded hover:bg-ink-wash"
              >
                {t("sourceList.cancel")}
              </button>
              <button
                onClick={() => {
                  const { image, sourceId } = resizeCandidate;
                  setResizeCandidate(null);
                  applyImageToSource(image, sourceId);
                }}
                className="px-3 py-1.5 text-sm text-ink-soft border border-rule rounded hover:bg-ink-wash"
              >
                {t("sourceList.keepOriginal")}
              </button>
              <button
                onClick={async () => {
                  const { image, sourceId } = resizeCandidate;
                  setResizeCandidate(null);
                  const resized = await resizeImageIfNeeded(image);
                  applyImageToSource(resized, sourceId);
                }}
                className="px-3 py-1.5 text-sm bg-rubric text-on-rubric rounded hover:bg-rubric-soft"
              >
                {t("sourceList.resize")}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* SourceModal — full metadata editing */}
      {editingSource && (
        <SourceModal
          source={editingSource}
          onSave={(updated) => {
            dispatch({ type: "UPDATE_SOURCE", payload: updated });
            setEditingSource(null);
          }}
          onClose={() => setEditingSource(null)}
        />
      )}
    </div>
  );
}
