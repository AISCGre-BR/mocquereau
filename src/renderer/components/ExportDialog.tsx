// src/renderer/components/ExportDialog.tsx
//
// Exportar DOCX deixou de ser tela: é um diálogo aberto pela ação principal da vista
// Tabela e por Arquivo > Exportar DOCX… (Ctrl+E).

import { useContext, useEffect, useState } from 'react';
import { Check, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { ProjectContext } from '../hooks/useProject';
import { collectDocxCrops } from '../lib/docx-collect';
import type { MocquereauProject } from '../lib/models';
import { Dialog } from '../ui/Dialog';
import { Button } from '../ui/Button';

interface ExportDialogProps {
  open: boolean;
  onClose: () => void;
}

type ExportState =
  | { phase: 'idle' }
  | { phase: 'collecting'; done: number; total: number }
  | { phase: 'saving' }
  | { phase: 'done'; filePath: string }
  | { phase: 'error'; message: string };

export function ExportDialog({ open, onClose }: ExportDialogProps) {
  const ctx = useContext(ProjectContext)!;
  const { t } = useTranslation();
  const project = ctx.state.project;
  const [exportState, setExportState] = useState<ExportState>({ phase: 'idle' });

  useEffect(() => {
    if (open) setExportState({ phase: 'idle' });
  }, [open]);

  const hasExportableData =
    project !== null &&
    project.sources.length > 0 &&
    project.sources.some((s) => s.lines.length > 0);
  const isWorking = exportState.phase === 'collecting' || exportState.phase === 'saving';

  async function handleExport() {
    if (!project || isWorking) return;
    setExportState({ phase: 'collecting', done: 0, total: 1 });
    try {
      const payload = await collectDocxCrops(
        project,
        (done, total) => {
          setExportState({ phase: 'collecting', done, total });
        },
        { untitled: t('file.untitled') },
      );
      setExportState({ phase: 'saving' });
      // A ponte do preload tipa o argumento como MocquereauProject; o valor real é o
      // DocxExportPayload, que o handler do main lê corretamente.
      const result = await window.mocquereau.exportDocx(payload as unknown as MocquereauProject);
      if (result === null) {
        setExportState({ phase: 'idle' }); // diálogo de salvar cancelado
      } else {
        setExportState({ phase: 'done', filePath: result.filePath });
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setExportState({ phase: 'error', message });
    }
  }

  function requestClose() {
    if (!isWorking) onClose();
  }

  const reset = () => setExportState({ phase: 'idle' });

  const actions =
    exportState.phase === 'done' ? (
      <>
        <Button onClick={reset}>{t('exportDialog.exportAgain')}</Button>
        <Button variant="filled" onClick={onClose} data-autofocus>
          {t('exportDialog.close')}
        </Button>
      </>
    ) : exportState.phase === 'error' ? (
      <>
        <Button variant="elevated" onClick={onClose}>
          {t('exportDialog.close')}
        </Button>
        <Button variant="filled" onClick={reset} data-autofocus>
          {t('exportDialog.tryAgain')}
        </Button>
      </>
    ) : (
      <>
        <Button variant="elevated" onClick={requestClose} disabled={isWorking}>
          {t('exportDialog.cancel')}
        </Button>
        <Button
          variant="filled"
          onClick={() => void handleExport()}
          disabled={!hasExportableData || isWorking}
          data-autofocus
        >
          {t('exportDialog.exportDocx')}
        </Button>
      </>
    );

  const percent =
    exportState.phase === 'collecting' && exportState.total > 0
      ? `${Math.round((exportState.done / exportState.total) * 100)}%`
      : '0%';

  return (
    <Dialog
      open={open}
      title={t('exportDialog.title')}
      onClose={requestClose}
      onConfirm={exportState.phase === 'idle' && hasExportableData ? () => void handleExport() : undefined}
      actions={actions}
    >
      <p className="m-0">
        {t('exportDialog.descriptionBefore')}{' '}
        <code className="rounded-xs bg-parchment-deep px-1">.docx</code>{' '}
        {t('exportDialog.descriptionAfter')}
      </p>

      {project && (
        <dl className="mt-3 mb-0 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-label text-ink-soft">
          <dt className="font-medium">{t('exportDialog.project')}</dt>
          <dd className="m-0 font-serif text-ink">{project.meta.title}</dd>
          <dt className="font-medium">{t('exportDialog.author')}</dt>
          <dd className="m-0">{project.meta.author || t('exportDialog.emptyAuthor')}</dd>
          <dt className="font-medium">{t('exportDialog.sources')}</dt>
          <dd className="sc-num m-0">{t('exportDialog.sourcesCount', { count: project.sources.length })}</dd>
          <dt className="font-medium">{t('exportDialog.syllables')}</dt>
          <dd className="sc-num m-0">{project.text.words.reduce((acc, w) => acc + w.syllables.length, 0)}</dd>
        </dl>
      )}

      {!hasExportableData && exportState.phase === 'idle' && (
        <p className="mt-3 mb-0 text-caption text-ink-muted">{t('exportDialog.noExportableData')}</p>
      )}

      {exportState.phase === 'collecting' && (
        <div className="mt-4 flex flex-col gap-2">
          <p className="sc-num m-0 text-label">
            {t('exportDialog.collecting', { done: exportState.done, total: exportState.total })}
          </p>
          <div className="h-1 w-full overflow-hidden rounded-xs bg-parchment-deep shadow-inset">
            <div className="h-full rounded-xs bg-rubric-soft transition-all" style={{ width: percent }} />
          </div>
        </div>
      )}

      {exportState.phase === 'saving' && (
        <p className="mt-4 mb-0 animate-pulse text-label">{t('exportDialog.openingSaveDialog')}</p>
      )}

      {exportState.phase === 'done' && (
        <div className="mt-4 flex items-start gap-3">
          <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-verdigris-wash text-success">
            <Check className="h-4 w-4" aria-hidden="true" />
          </span>
          <div>
            <p className="m-0 font-medium text-ink">{t('exportDialog.success')}</p>
            <p className="m-0 mt-1 break-all text-caption text-ink-muted">{exportState.filePath}</p>
          </div>
        </div>
      )}

      {exportState.phase === 'error' && (
        <div className="mt-4 flex items-start gap-3">
          <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-rubric-wash text-danger">
            <X className="h-4 w-4" aria-hidden="true" />
          </span>
          <div>
            <p className="m-0 font-medium text-ink">{t('exportDialog.error')}</p>
            <p className="m-0 mt-1 text-caption text-danger">{exportState.message}</p>
          </div>
        </div>
      )}
    </Dialog>
  );
}
