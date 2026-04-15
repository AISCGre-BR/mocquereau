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
import type { ManuscriptSource, StoredImage, GuerangerManuscript } from "../lib/models";
import { SourceModal } from "./SourceModal";

// ── Types ─────────────────────────────────────────────────────────────────────

interface ScreenProps {
  onNext: () => void;
  onPrev: () => void;
  canGoNext: boolean;
  canGoPrev: boolean;
}

// ── Constants ─────────────────────────────────────────────────────────────────

const NOTATION_BADGE: Record<ManuscriptSource["metadata"]["notation"], string> = {
  adiastematic: "bg-amber-100 text-amber-800",
  diastematic: "bg-blue-100 text-blue-800",
  square: "bg-green-100 text-green-800",
  modern: "bg-purple-100 text-purple-800",
  other: "bg-gray-100 text-gray-700",
};

const NOTATION_LABELS: Record<ManuscriptSource["metadata"]["notation"], string> = {
  adiastematic: "Adiast.",
  diastematic: "Diast.",
  square: "Quadr.",
  modern: "Mod.",
  other: "Outra",
};

const NOTATION_OPTIONS = Object.keys(NOTATION_LABELS) as ManuscriptSource["metadata"]["notation"][];

// ── Helpers ───────────────────────────────────────────────────────────────────

function createEmptySource(): ManuscriptSource {
  return {
    id: crypto.randomUUID(),
    order: 0,
    metadata: {
      siglum: "",
      library: "",
      city: "",
      century: "",
      folio: "",
      notation: "other",
    },
    lines: [],
    syllableCuts: {},
  };
}

function guerangerToSource(gm: GuerangerManuscript, order: number): ManuscriptSource {
  return {
    id: crypto.randomUUID(),
    order,
    metadata: {
      siglum: gm.siglum || "",
      library: gm.library || "",
      city: gm.city || "",
      century: gm.century || "",
      folio: gm.folio || "",
      notation: "other",
      cantusId: gm.cantusId || undefined,
      sourceUrl: gm.sourceUrl || undefined,
      iiifManifest: gm.iiifManifest || undefined,
    },
    lines: [],
    syllableCuts: {},
  };
}

function getFirstImage(source: ManuscriptSource): StoredImage | null {
  return source.lines[0]?.image ?? null;
}

// ── Component ─────────────────────────────────────────────────────────────────

export function SourceList({ onNext, onPrev, canGoNext, canGoPrev }: ScreenProps) {
  const { state, dispatch } = useProject();

  const sources = state.project?.sources ?? [];
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
    const updated: ManuscriptSource = {
      ...source,
      lines: [
        {
          id: crypto.randomUUID(),
          image,
          syllableRange: { start: 0, end: 0 },
          dividers: [],
          gaps: [],
          confirmed: false,
        },
      ],
    };
    dispatch({ type: "UPDATE_SOURCE", payload: updated });
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

  function handleNotationChange(
    source: ManuscriptSource,
    value: ManuscriptSource["metadata"]["notation"]
  ) {
    dispatch({
      type: "UPDATE_SOURCE",
      payload: { ...source, metadata: { ...source.metadata, notation: value } },
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
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <div className="flex-1 w-full px-4 py-4 space-y-3">
        {/* Header + toolbar */}
        <div className="flex items-center justify-between">
          <h1 className="text-lg font-bold text-gray-900">
            Fontes
            {sources.length > 0 && (
              <span className="ml-2 text-sm font-normal text-gray-400">
                ({sources.length})
              </span>
            )}
          </h1>
          <div className="flex gap-2">
            <button
              onClick={handleImportGueranger}
              className="px-3 py-1.5 text-xs text-gray-700 border border-gray-300 rounded hover:bg-gray-50"
            >
              Importar Gueranger
            </button>
            <button
              onClick={handleAddSource}
              disabled={!state.project}
              className="flex items-center gap-1 px-3 py-1.5 text-xs bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-40"
            >
              <Plus size={12} />
              Adicionar
            </button>
          </div>
        </div>

        {/* Spreadsheet-style table */}
        {sources.length === 0 ? (
          <div className="bg-white rounded border border-gray-200 p-8 text-center">
            <p className="text-gray-400 text-sm">
              Nenhuma fonte. Clique em "Adicionar" ou "Importar Gueranger".
            </p>
          </div>
        ) : (
          <div className="bg-white rounded border border-gray-200 overflow-x-auto">
            <table className="w-full text-xs border-collapse">
              <thead>
                <tr className="border-b border-gray-200 bg-gray-50 text-gray-500 font-medium">
                  <th className="px-1 py-1.5 w-10 text-center">#</th>
                  <th className="px-2 py-1.5 text-left">Sigla</th>
                  <th className="px-2 py-1.5 text-left">Cidade</th>
                  <th className="px-2 py-1.5 text-left w-16">Séc.</th>
                  <th className="px-2 py-1.5 text-left w-16">Fólio</th>
                  <th className="px-2 py-1.5 text-left w-16">Notação</th>
                  <th className="px-2 py-1.5 text-center w-14">Progr.</th>
                  <th className="px-2 py-1.5 text-center w-16">Imagem</th>
                  <th className="px-1 py-1.5 w-24 text-center">Ações</th>
                </tr>
              </thead>
              <tbody>
                {sources.map((source, idx) => {
                  const isSelected = selectedId === source.id;
                  const isFirst = idx === 0;
                  const isLast = idx === sources.length - 1;
                  const progress = getProgress(source);
                  const img = getFirstImage(source);

                  return (
                    <tr
                      key={source.id}
                      data-source-id={source.id}
                      onClick={() => setSelectedId(source.id)}
                      className={[
                        "border-b border-gray-100 transition-colors",
                        isSelected
                          ? "bg-blue-50 ring-1 ring-inset ring-blue-200"
                          : "hover:bg-gray-50",
                      ].join(" ")}
                    >
                      {/* Row number */}
                      <td className="px-1 py-1 text-center text-gray-400 font-mono">
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
                          placeholder="F-Pn lat. 903"
                          className="w-full bg-transparent border-b border-transparent hover:border-gray-300 focus:border-blue-500 outline-none py-0.5 text-xs font-mono"
                        />
                      </td>

                      {/* City */}
                      <td className="px-2 py-1" onClick={(e) => e.stopPropagation()}>
                        <input
                          type="text"
                          defaultValue={source.metadata.city}
                          onBlur={(e) => handleFieldBlur(source, "city", e.target.value)}
                          onFocus={() => setSelectedId(source.id)}
                          placeholder="Paris"
                          className="w-full bg-transparent border-b border-transparent hover:border-gray-300 focus:border-blue-500 outline-none py-0.5 text-xs"
                        />
                      </td>

                      {/* Century */}
                      <td className="px-2 py-1" onClick={(e) => e.stopPropagation()}>
                        <input
                          type="text"
                          defaultValue={source.metadata.century}
                          onBlur={(e) => handleFieldBlur(source, "century", e.target.value)}
                          onFocus={() => setSelectedId(source.id)}
                          placeholder="XII"
                          className="w-full bg-transparent border-b border-transparent hover:border-gray-300 focus:border-blue-500 outline-none py-0.5 text-xs"
                        />
                      </td>

                      {/* Folio */}
                      <td className="px-2 py-1" onClick={(e) => e.stopPropagation()}>
                        <input
                          type="text"
                          defaultValue={source.metadata.folio}
                          onBlur={(e) => handleFieldBlur(source, "folio", e.target.value)}
                          onFocus={() => setSelectedId(source.id)}
                          placeholder="145v"
                          className="w-full bg-transparent border-b border-transparent hover:border-gray-300 focus:border-blue-500 outline-none py-0.5 text-xs"
                        />
                      </td>

                      {/* Notation */}
                      <td className="px-2 py-1" onClick={(e) => e.stopPropagation()}>
                        <select
                          value={source.metadata.notation}
                          onChange={(e) =>
                            handleNotationChange(
                              source,
                              e.target.value as ManuscriptSource["metadata"]["notation"]
                            )
                          }
                          onFocus={() => setSelectedId(source.id)}
                          className={`text-xs rounded px-1 py-0.5 border-0 ${NOTATION_BADGE[source.metadata.notation]} cursor-pointer focus:outline-none focus:ring-1 focus:ring-blue-400`}
                        >
                          {NOTATION_OPTIONS.map((opt) => (
                            <option key={opt} value={opt}>
                              {NOTATION_LABELS[opt]}
                            </option>
                          ))}
                        </select>
                      </td>

                      {/* Progress */}
                      <td className="px-2 py-1 text-center text-gray-400 tabular-nums">
                        {progress}/{totalSyllables}
                      </td>

                      {/* Image thumbnail / drop target */}
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
                          <img
                            src={img.dataUrl}
                            alt=""
                            className="h-6 max-w-12 object-contain inline-block rounded cursor-pointer"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleImageCellClick(source.id);
                            }}
                            title={`${img.width}×${img.height}px — clique para trocar`}
                          />
                        ) : (
                          <button
                            className="flex items-center gap-1 px-2 py-0.5 text-xs text-blue-600 bg-blue-50 border border-blue-200 rounded hover:bg-blue-100 transition-colors"
                            title="Adicionar imagem (ou Ctrl+V)"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleImageCellClick(source.id);
                            }}
                          >
                            <ImagePlus size={11} />
                            Img
                          </button>
                        )}
                      </td>

                      {/* Actions */}
                      <td className="px-1 py-1" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center justify-center gap-0.5">
                          <button
                            disabled={isFirst}
                            onClick={() => handleReorder(source.id, "up")}
                            className="p-0.5 rounded text-gray-400 hover:text-gray-700 hover:bg-gray-200 disabled:opacity-20 transition-colors"
                            title="↑"
                          >
                            <ArrowUp size={11} />
                          </button>
                          <button
                            disabled={isLast}
                            onClick={() => handleReorder(source.id, "down")}
                            className="p-0.5 rounded text-gray-400 hover:text-gray-700 hover:bg-gray-200 disabled:opacity-20 transition-colors"
                            title="↓"
                          >
                            <ArrowDown size={11} />
                          </button>
                          <button
                            onClick={() => setEditingSource(source)}
                            className="p-0.5 rounded text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors"
                            title="Editar tudo"
                          >
                            <Edit2 size={11} />
                          </button>
                          <button
                            onClick={() => handleDuplicateSource(source.id)}
                            className="p-0.5 rounded text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors"
                            title="Duplicar"
                          >
                            <Copy size={11} />
                          </button>
                          <button
                            onClick={() => handleDeleteSource(source.id)}
                            className="p-0.5 rounded text-gray-400 hover:text-red-600 hover:bg-red-50 transition-colors"
                            title="Remover"
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

        <p className="text-xs text-gray-400">
          Selecione uma linha e pressione Ctrl+V para colar imagem do clipboard.
          Arraste imagens direto na célula de imagem.
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
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-xl p-6 max-w-sm w-full mx-4 space-y-4">
            <h3 className="text-sm font-semibold text-gray-900">
              Imagem grande ({resizeCandidate.image.width}px)
            </h3>
            <p className="text-sm text-gray-600">
              Deseja redimensionar para 2000px de largura?
            </p>
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => setResizeCandidate(null)}
                className="px-3 py-1.5 text-sm text-gray-600 border border-gray-300 rounded hover:bg-gray-50"
              >
                Cancelar
              </button>
              <button
                onClick={() => {
                  const { image, sourceId } = resizeCandidate;
                  setResizeCandidate(null);
                  applyImageToSource(image, sourceId);
                }}
                className="px-3 py-1.5 text-sm text-gray-700 border border-gray-300 rounded hover:bg-gray-50"
              >
                Manter original
              </button>
              <button
                onClick={async () => {
                  const { image, sourceId } = resizeCandidate;
                  setResizeCandidate(null);
                  const resized = await resizeImageIfNeeded(image);
                  applyImageToSource(resized, sourceId);
                }}
                className="px-3 py-1.5 text-sm bg-blue-600 text-white rounded hover:bg-blue-700"
              >
                Redimensionar
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

      {/* Bottom navigation */}
      <div className="sticky bottom-0 bg-white border-t border-gray-200 px-4 py-3">
        <div className="flex items-center justify-between">
          <button
            onClick={onPrev}
            disabled={!canGoPrev}
            className="px-4 py-2 text-sm text-gray-700 border border-gray-300 rounded hover:bg-gray-50 disabled:opacity-40"
          >
            Anterior
          </button>
          <button
            onClick={onNext}
            disabled={!canGoNext}
            className="px-4 py-2 text-sm bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-40"
          >
            Próximo →
          </button>
        </div>
      </div>
    </div>
  );
}
