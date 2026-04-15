// src/renderer/components/ExportDialog.tsx

import { useState, useContext } from 'react';
import { ProjectContext } from '../hooks/useProject';
import { collectDocxCrops } from '../lib/docx-collect';

interface ScreenProps {
  onNext: () => void;
  onPrev: () => void;
  canGoNext: boolean;
  canGoPrev: boolean;
}

type ExportState =
  | { phase: 'idle' }
  | { phase: 'collecting'; done: number; total: number }
  | { phase: 'saving' }
  | { phase: 'done'; filePath: string }
  | { phase: 'error'; message: string };

export function ExportDialog({ onPrev, canGoPrev }: ScreenProps) {
  const ctx = useContext(ProjectContext)!;
  const project = ctx.state.project;

  const [exportState, setExportState] = useState<ExportState>({ phase: 'idle' });

  // Disable button if no project or no sources with any lines
  const hasExportableData =
    project !== null &&
    project.sources.length > 0 &&
    project.sources.some(s => s.lines.length > 0);

  async function handleExport() {
    if (!project || exportState.phase === 'collecting' || exportState.phase === 'saving') return;

    setExportState({ phase: 'collecting', done: 0, total: 1 });

    try {
      const payload = await collectDocxCrops(project, (done, total) => {
        setExportState({ phase: 'collecting', done, total });
      });

      setExportState({ phase: 'saving' });

      const result = await window.mocquereau.exportDocx(payload as unknown as import('../lib/models').MocquereauProject);
      // Note: exportDocx bridge sends payload; main receives DocxExportPayload.
      // Type cast needed because preload bridge is typed as MocquereauProject (existing stub type).
      // The actual runtime value is DocxExportPayload — main handler reads it correctly.

      if (result === null) {
        // User cancelled save dialog — return to idle silently
        setExportState({ phase: 'idle' });
      } else {
        setExportState({ phase: 'done', filePath: result.filePath });
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setExportState({ phase: 'error', message });
    }
  }

  function handleReset() {
    setExportState({ phase: 'idle' });
  }

  const isWorking = exportState.phase === 'collecting' || exportState.phase === 'saving';

  return (
    <div className="flex flex-col h-full p-8 max-w-2xl mx-auto">
      <h1 className="text-2xl font-bold text-gray-900 mb-2">Exportação</h1>
      <p className="text-gray-500 text-sm mb-8">
        Gera um arquivo <code className="bg-gray-100 px-1 rounded">.docx</code> com a tabela
        neumática comparativa em orientação paisagem.
      </p>

      {/* Project summary */}
      {project && (
        <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 mb-6 text-sm text-gray-700">
          <p><span className="font-medium">Projeto:</span> {project.meta.title}</p>
          <p><span className="font-medium">Autor:</span> {project.meta.author || '—'}</p>
          <p>
            <span className="font-medium">Fontes:</span> {project.sources.length} manuscrito(s)
          </p>
          <p>
            <span className="font-medium">Sílabas:</span>{' '}
            {project.text.words.reduce((acc, w) => acc + w.syllables.length, 0)}
          </p>
        </div>
      )}

      {/* Export button + feedback */}
      <div className="flex-1 flex flex-col items-center justify-center gap-6">

        {/* Idle state */}
        {exportState.phase === 'idle' && (
          <button
            onClick={handleExport}
            disabled={!hasExportableData}
            className="px-8 py-3 bg-blue-600 text-white text-base font-medium rounded-lg
                       disabled:opacity-40 disabled:cursor-not-allowed
                       hover:bg-blue-700 active:bg-blue-800 transition-colors"
          >
            Exportar DOCX
          </button>
        )}

        {!hasExportableData && exportState.phase === 'idle' && (
          <p className="text-sm text-gray-400 text-center">
            Nenhuma fonte com imagens configuradas. Complete o recorte das sílabas antes de exportar.
          </p>
        )}

        {/* Collecting crops */}
        {exportState.phase === 'collecting' && (
          <div className="w-full max-w-sm flex flex-col items-center gap-3">
            <p className="text-sm text-gray-600">
              Recortando imagens… {exportState.done} / {exportState.total} células
            </p>
            <div className="w-full bg-gray-200 rounded-full h-2">
              <div
                className="bg-blue-600 h-2 rounded-full transition-all"
                style={{
                  width: exportState.total > 0
                    ? `${Math.round((exportState.done / exportState.total) * 100)}%`
                    : '0%',
                }}
              />
            </div>
          </div>
        )}

        {/* Saving (dialog open) */}
        {exportState.phase === 'saving' && (
          <p className="text-sm text-gray-600 animate-pulse">
            Abrindo diálogo de salvar…
          </p>
        )}

        {/* Done */}
        {exportState.phase === 'done' && (
          <div className="flex flex-col items-center gap-4 text-center">
            <div className="w-12 h-12 rounded-full bg-green-100 flex items-center justify-center">
              <svg className="w-6 h-6 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <div>
              <p className="font-medium text-gray-900">Exportado com sucesso!</p>
              <p className="text-sm text-gray-500 mt-1 break-all">{exportState.filePath}</p>
            </div>
            <button
              onClick={handleReset}
              className="text-sm text-blue-600 hover:underline"
            >
              Exportar novamente
            </button>
          </div>
        )}

        {/* Error */}
        {exportState.phase === 'error' && (
          <div className="flex flex-col items-center gap-4 text-center">
            <div className="w-12 h-12 rounded-full bg-red-100 flex items-center justify-center">
              <svg className="w-6 h-6 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </div>
            <div>
              <p className="font-medium text-gray-900">Erro ao exportar</p>
              <p className="text-sm text-red-500 mt-1">{exportState.message}</p>
            </div>
            <button
              onClick={handleReset}
              className="text-sm text-blue-600 hover:underline"
            >
              Tentar novamente
            </button>
          </div>
        )}
      </div>

      {/* Navigation */}
      <div className="flex justify-between pt-4 border-t border-gray-200">
        <button
          onClick={onPrev}
          disabled={!canGoPrev || isWorking}
          className="px-4 py-2 bg-gray-200 text-gray-700 rounded disabled:opacity-40 hover:bg-gray-300"
        >
          Anterior
        </button>
        {/* No "Próximo" — this is the last screen */}
      </div>
    </div>
  );
}
