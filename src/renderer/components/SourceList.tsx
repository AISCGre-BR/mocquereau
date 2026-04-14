import { useState, useEffect } from "react";
import {
  ArrowUp,
  ArrowDown,
  Trash2,
  Copy,
  Edit2,
  Upload,
  Clipboard,
  Plus,
  Loader2,
} from "lucide-react";
import { useProject } from "../hooks/useProject";
import { fileToDataUrl, resizeImageIfNeeded } from "../lib/image-utils";
import type { ManuscriptSource, StoredImage, GuerangerManuscript } from "../lib/models";

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
  adiastematic: "Adiastemática",
  diastematic: "Diastemática",
  square: "Quadrada",
  modern: "Moderna",
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

// ── Component ─────────────────────────────────────────────────────────────────

export function SourceList({ onNext, onPrev, canGoNext, canGoPrev }: ScreenProps) {
  const { state, dispatch } = useProject();

  const sources = state.project?.sources ?? [];
  const totalSyllables =
    state.project?.text.words.flatMap((w) => w.syllables).length ?? 0;

  // ── Local state ─────────────────────────────────────────────────────────────
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [resizeCandidate, setResizeCandidate] = useState<{
    image: StoredImage;
    sourceId: string;
  } | null>(null);
  const [iiifLoading, setIiifLoading] = useState<string | null>(null);
  const [editingSource, setEditingSource] = useState<ManuscriptSource | null>(null);

  // ── Derived ─────────────────────────────────────────────────────────────────
  const selectedSource = sources.find((s) => s.id === selectedId) ?? null;

  function getProgress(source: ManuscriptSource): number {
    return Object.values(source.syllableCuts).filter(
      (c) => c !== null && c !== undefined
    ).length;
  }

  // ── Image handling ───────────────────────────────────────────────────────────

  function applyImageToSource(image: StoredImage, sourceId: string) {
    const source = sources.find((s) => s.id === sourceId);
    if (!source) return;
    const lineId = crypto.randomUUID();
    const updatedSource: ManuscriptSource = {
      ...source,
      lines: [
        {
          id: lineId,
          image,
          syllableRange: { start: 0, end: 0 },
          dividers: [],
          gaps: [],
          confirmed: false,
        },
      ],
    };
    dispatch({ type: "UPDATE_SOURCE", payload: updatedSource });
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

  // ── Keyboard paste ────────────────────────────────────────────────────────

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

  // ── Source actions ────────────────────────────────────────────────────────

  function handleAddSource() {
    const newSource = createEmptySource();
    dispatch({ type: "ADD_SOURCE", payload: newSource });
    setSelectedId(newSource.id);
  }

  function handleDeleteSource(id: string) {
    if (!window.confirm("Remover esta fonte? Esta ação não pode ser desfeita.")) return;
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
    const updated: ManuscriptSource = {
      ...source,
      metadata: { ...source.metadata, notation: value },
    };
    dispatch({ type: "UPDATE_SOURCE", payload: updated });
  }

  async function handleImportGueranger() {
    const result = await window.mocquereau.importGueranger();
    if (!result) return;
    result.manuscripts.forEach((gm, i) => {
      const source = guerangerToSource(gm, sources.length + i + 1);
      dispatch({ type: "ADD_SOURCE", payload: source });
    });
  }

  // ── Image load buttons ────────────────────────────────────────────────────

  async function handleUpload() {
    if (!selectedId) return;
    const result = await window.mocquereau.openImageFile();
    if (result) await handleImageLoaded(result, selectedId);
  }

  async function handlePaste() {
    if (!selectedId) return;
    const result = await window.mocquereau.readClipboardImage();
    if (result) await handleImageLoaded(result, selectedId);
  }

  async function handleIiifFetch() {
    if (!selectedId || !selectedSource?.metadata.iiifManifest) return;
    setIiifLoading(selectedId);
    try {
      const result = await window.mocquereau.fetchIiifImage(
        selectedSource.metadata.iiifManifest
      );
      if (result) await handleImageLoaded(result, selectedId);
    } finally {
      setIiifLoading(null);
    }
  }

  // ── Drag and drop ─────────────────────────────────────────────────────────

  function handleDragOver(e: React.DragEvent) {
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = "copy";
    setDragOver(true);
  }

  function handleDragLeave(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
  }

  async function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (!file || !selectedId) return;
    const image = await fileToDataUrl(file);
    await handleImageLoaded(
      { dataUrl: image.dataUrl, width: image.width, height: image.height },
      selectedId
    );
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <div className="flex-1 max-w-6xl mx-auto w-full px-4 py-6 space-y-4">

        {/* Header + toolbar */}
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-bold text-gray-900">
            Fontes / Manuscritos
            {sources.length > 0 && (
              <span className="ml-2 text-sm font-normal text-gray-400">
                ({sources.length} {sources.length === 1 ? "fonte" : "fontes"})
              </span>
            )}
          </h1>
          <div className="flex gap-2">
            <button
              onClick={handleImportGueranger}
              className="px-3 py-1.5 text-sm text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
            >
              Importar do Gueranger
            </button>
            <button
              onClick={handleAddSource}
              disabled={!state.project}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-40"
            >
              <Plus size={14} />
              Adicionar fonte
            </button>
          </div>
        </div>

        {/* Sources table */}
        {sources.length === 0 ? (
          <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
            <p className="text-gray-400 text-sm">
              Nenhuma fonte adicionada. Clique em "Adicionar fonte" para começar.
            </p>
          </div>
        ) : (
          <div className="bg-white rounded-xl border border-gray-200 overflow-x-auto">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="border-b border-gray-200 bg-gray-50">
                  <th className="px-2 py-2 text-left font-medium text-gray-500 w-16">
                    ↑↓
                  </th>
                  <th className="px-3 py-2 text-left font-medium text-gray-500">
                    Sigla
                  </th>
                  <th className="px-3 py-2 text-left font-medium text-gray-500">
                    Cidade
                  </th>
                  <th className="px-3 py-2 text-left font-medium text-gray-500">
                    Século
                  </th>
                  <th className="px-3 py-2 text-left font-medium text-gray-500">
                    Fólio
                  </th>
                  <th className="px-3 py-2 text-left font-medium text-gray-500">
                    Notação
                  </th>
                  <th className="px-3 py-2 text-left font-medium text-gray-500">
                    Progresso
                  </th>
                  <th className="px-3 py-2 text-left font-medium text-gray-500 w-24">
                    Ações
                  </th>
                </tr>
              </thead>
              <tbody>
                {sources.map((source, idx) => {
                  const isSelected = selectedId === source.id;
                  const isFirst = idx === 0;
                  const isLast = idx === sources.length - 1;
                  const progress = getProgress(source);

                  return (
                    <tr
                      key={source.id}
                      onClick={() => setSelectedId(isSelected ? null : source.id)}
                      className={[
                        "border-b border-gray-100 cursor-pointer transition-colors",
                        isSelected ? "bg-blue-50" : "hover:bg-gray-50",
                      ].join(" ")}
                    >
                      {/* Reorder buttons */}
                      <td
                        className="px-2 py-2"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <div className="flex flex-col gap-0.5">
                          <button
                            disabled={isFirst}
                            onClick={() => handleReorder(source.id, "up")}
                            className="p-0.5 rounded text-gray-400 hover:text-gray-700 hover:bg-gray-200 disabled:opacity-20 disabled:cursor-not-allowed transition-colors"
                            title="Mover para cima"
                          >
                            <ArrowUp size={12} />
                          </button>
                          <button
                            disabled={isLast}
                            onClick={() => handleReorder(source.id, "down")}
                            className="p-0.5 rounded text-gray-400 hover:text-gray-700 hover:bg-gray-200 disabled:opacity-20 disabled:cursor-not-allowed transition-colors"
                            title="Mover para baixo"
                          >
                            <ArrowDown size={12} />
                          </button>
                        </div>
                      </td>

                      {/* Siglum */}
                      <td
                        className="px-3 py-2"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <input
                          type="text"
                          defaultValue={source.metadata.siglum}
                          onBlur={(e) =>
                            handleFieldBlur(source, "siglum", e.target.value)
                          }
                          onClick={() => setSelectedId(source.id)}
                          placeholder="—"
                          className="w-full bg-transparent border-b border-transparent hover:border-gray-300 focus:border-blue-400 outline-none px-0 py-0.5 text-sm font-mono"
                        />
                      </td>

                      {/* City */}
                      <td
                        className="px-3 py-2"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <input
                          type="text"
                          defaultValue={source.metadata.city}
                          onBlur={(e) =>
                            handleFieldBlur(source, "city", e.target.value)
                          }
                          onClick={() => setSelectedId(source.id)}
                          placeholder="—"
                          className="w-full bg-transparent border-b border-transparent hover:border-gray-300 focus:border-blue-400 outline-none px-0 py-0.5 text-sm"
                        />
                      </td>

                      {/* Century */}
                      <td
                        className="px-3 py-2"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <input
                          type="text"
                          defaultValue={source.metadata.century}
                          onBlur={(e) =>
                            handleFieldBlur(source, "century", e.target.value)
                          }
                          onClick={() => setSelectedId(source.id)}
                          placeholder="—"
                          className="w-20 bg-transparent border-b border-transparent hover:border-gray-300 focus:border-blue-400 outline-none px-0 py-0.5 text-sm"
                        />
                      </td>

                      {/* Folio */}
                      <td
                        className="px-3 py-2"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <input
                          type="text"
                          defaultValue={source.metadata.folio}
                          onBlur={(e) =>
                            handleFieldBlur(source, "folio", e.target.value)
                          }
                          onClick={() => setSelectedId(source.id)}
                          placeholder="—"
                          className="w-20 bg-transparent border-b border-transparent hover:border-gray-300 focus:border-blue-400 outline-none px-0 py-0.5 text-sm"
                        />
                      </td>

                      {/* Notation badge + select */}
                      <td
                        className="px-3 py-2"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <div className="flex items-center gap-2">
                          <span
                            className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
                              NOTATION_BADGE[source.metadata.notation]
                            }`}
                          >
                            {NOTATION_LABELS[source.metadata.notation]}
                          </span>
                          <select
                            value={source.metadata.notation}
                            onChange={(e) =>
                              handleNotationChange(
                                source,
                                e.target.value as ManuscriptSource["metadata"]["notation"]
                              )
                            }
                            onClick={() => setSelectedId(source.id)}
                            className="text-xs border border-gray-200 rounded px-1 py-0.5 bg-white text-gray-600 focus:outline-none focus:border-blue-400"
                          >
                            {NOTATION_OPTIONS.map((opt) => (
                              <option key={opt} value={opt}>
                                {NOTATION_LABELS[opt]}
                              </option>
                            ))}
                          </select>
                        </div>
                      </td>

                      {/* Progress */}
                      <td className="px-3 py-2 text-gray-500 tabular-nums">
                        <span className={progress > 0 ? "text-green-700 font-medium" : ""}>
                          {progress}
                        </span>
                        <span className="text-gray-400">/{totalSyllables}</span>
                      </td>

                      {/* Actions */}
                      <td
                        className="px-3 py-2"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => setEditingSource(source)}
                            className="p-1 rounded text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors"
                            title="Editar metadados completos"
                          >
                            <Edit2 size={14} />
                          </button>
                          <button
                            onClick={() => handleDuplicateSource(source.id)}
                            className="p-1 rounded text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors"
                            title="Duplicar"
                          >
                            <Copy size={14} />
                          </button>
                          <button
                            onClick={() => handleDeleteSource(source.id)}
                            className="p-1 rounded text-gray-400 hover:text-red-600 hover:bg-red-50 transition-colors"
                            title="Remover"
                          >
                            <Trash2 size={14} />
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

        {/* Image zone — shown when a source is selected */}
        {selectedSource && (
          <div className="bg-white rounded-xl border border-gray-200 p-4 space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-gray-700">
                Imagem —{" "}
                <span className="font-mono text-blue-700">
                  {selectedSource.metadata.siglum || "(sem sigla)"}
                </span>
              </h2>
              <div className="flex gap-2">
                <button
                  onClick={handleUpload}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
                  title="Carregar arquivo de imagem"
                >
                  <Upload size={12} />
                  Carregar arquivo
                </button>
                <button
                  onClick={handlePaste}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
                  title="Colar imagem do clipboard (Ctrl+V)"
                >
                  <Clipboard size={12} />
                  Colar (Ctrl+V)
                </button>
                {selectedSource.metadata.iiifManifest && (
                  <button
                    onClick={handleIiifFetch}
                    disabled={iiifLoading === selectedId}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-indigo-700 border border-indigo-300 bg-indigo-50 rounded-lg hover:bg-indigo-100 transition-colors disabled:opacity-60"
                    title={`Carregar do IIIF: ${selectedSource.metadata.iiifManifest}`}
                  >
                    {iiifLoading === selectedId ? (
                      <Loader2 size={12} className="animate-spin" />
                    ) : null}
                    Carregar do IIIF
                  </button>
                )}
              </div>
            </div>

            {/* Drag-drop zone */}
            <div
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              className={[
                "relative rounded-lg border-2 border-dashed transition-colors",
                dragOver
                  ? "border-blue-400 bg-blue-50"
                  : "border-gray-300 bg-gray-50",
              ].join(" ")}
              style={{ minHeight: 120 }}
            >
              {selectedSource.lines[0]?.image.dataUrl ? (
                <div className="p-2">
                  <img
                    src={selectedSource.lines[0].image.dataUrl}
                    alt="Imagem carregada"
                    className="max-h-48 max-w-full rounded object-contain mx-auto block"
                  />
                  <p className="text-center text-xs text-gray-400 mt-1">
                    {selectedSource.lines[0].image.width} ×{" "}
                    {selectedSource.lines[0].image.height} px —{" "}
                    {selectedSource.lines[0].image.mimeType}
                  </p>
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center h-28 text-gray-400 text-xs gap-1 pointer-events-none">
                  <Upload size={20} className="text-gray-300" />
                  <p>Arraste e solte uma imagem aqui (PNG, JPG, WEBP, TIFF)</p>
                  <p>ou use os botões acima / Ctrl+V</p>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Resize confirmation dialog */}
      {resizeCandidate && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-xl p-6 max-w-sm w-full mx-4 space-y-4">
            <h3 className="text-sm font-semibold text-gray-900">
              Imagem grande detectada
            </h3>
            <p className="text-sm text-gray-600">
              Esta imagem tem{" "}
              <span className="font-medium">{resizeCandidate.image.width}px</span> de
              largura. Deseja redimensionar para 2000px para economizar espaço?
            </p>
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => setResizeCandidate(null)}
                className="px-3 py-1.5 text-sm text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50"
              >
                Cancelar
              </button>
              <button
                onClick={() => {
                  const { image, sourceId } = resizeCandidate;
                  setResizeCandidate(null);
                  applyImageToSource(image, sourceId);
                }}
                className="px-3 py-1.5 text-sm text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50"
              >
                Usar original
              </button>
              <button
                onClick={async () => {
                  const { image, sourceId } = resizeCandidate;
                  setResizeCandidate(null);
                  const resized = await resizeImageIfNeeded(image);
                  applyImageToSource(resized, sourceId);
                }}
                className="px-3 py-1.5 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700"
              >
                Redimensionar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Bottom navigation */}
      <div className="sticky bottom-0 bg-white border-t border-gray-200 px-4 py-3">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <button
            onClick={onPrev}
            disabled={!canGoPrev}
            className="px-4 py-2 text-sm text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-40"
          >
            Anterior
          </button>
          <button
            onClick={onNext}
            disabled={!canGoNext}
            className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-40"
          >
            Próximo →
          </button>
        </div>
      </div>
    </div>
  );
}
