// src/renderer/components/TablePreview.tsx
//
// Vista Tabela: prévia do documento num cartão — título e autor da peça e a
// tabela comparativa (uma coluna por sílaba, uma linha por fonte, agrupadas
// pelo nível 1 da classificação). O zoom vem do TableZoomProvider.

import { useState, useContext } from 'react';
import { ProjectContext } from '../hooks/useProject';
import { useTableZoom, useTableZoomShortcuts } from '../hooks/useTableZoom';
import { flattenSyllables } from '../lib/sliceUtils';
import { resolveCellState, isWordBoundary, firstFolio } from '../lib/tableUtils';
import { tableRows } from '../lib/sources';
import { TableCell } from './table-preview/TableCell';
import { ContextMenu } from './table-preview/ContextMenu';
import type { ManuscriptSource } from '../lib/models';
import { useTranslation } from 'react-i18next';

// ── Layout (valores a 100%) ──────────────────────────────────────────────────
// O zoom escala estes tamanhos em vez de usar transform: o cabeçalho e a coluna
// de metadados continuam fixos (sticky) em qualquer nível.
const BASE_METADATA_COL_WIDTH = 190;
const BASE_COL_WIDTH = 64;
const BASE_ROW_HEIGHT = 80;
const BASE_HEADER_ROW_HEIGHT = 34;
const BASE_SIGLUM_FONT_SIZE = 15; // serifa 15/500
const BASE_SIGLUM_LINE_HEIGHT = 20;
const BASE_SYL_FONT_SIZE = 15; // serifa 15
const BASE_CAPTION_FONT_SIZE = 12; // caption
const BASE_CAPTION_LINE_HEIGHT = 16;

/** Legenda da fonte: "Cidade, Data · f. 12r", sem as partes vazias. */
export function sourceCaption(source: ManuscriptSource): string {
  const place = [source.metadata.city.trim(), source.metadata.century.trim()].filter(Boolean).join(', ');
  const folio = firstFolio(source);
  return [place, folio ? `f. ${folio}` : ''].filter(Boolean).join(' · ');
}

// ── Props ────────────────────────────────────────────────────────────────────
interface TablePreviewProps {
  onNavigateToEditor?: (sourceId: string, syllable: number) => void;
}

// ── Context menu state ────────────────────────────────────────────────────────
interface MenuState {
  x: number;
  y: number;
  sourceId: string;
  syllableIdx: number;
}

export function TablePreview({ onNavigateToEditor }: TablePreviewProps) {
  const { state, dispatch } = useContext(ProjectContext)!;
  const { t } = useTranslation();
  const [menu, setMenu] = useState<MenuState | null>(null);
  const { zoom } = useTableZoom();
  useTableZoomShortcuts();

  // Tamanhos escalados; Math.round evita larguras fracionárias que borram as bordas fixas.
  const scale = (base: number) => Math.round((base * zoom) / 100);
  const METADATA_COL_WIDTH = scale(BASE_METADATA_COL_WIDTH);
  const COL_WIDTH = scale(BASE_COL_WIDTH);
  const ROW_HEIGHT = scale(BASE_ROW_HEIGHT);
  const HEADER_ROW_HEIGHT = scale(BASE_HEADER_ROW_HEIGHT);

  const project = state.project;
  const author = project?.meta.author.trim() ?? '';
  const title = project?.meta.title.trim() || t('file.untitled');

  // ── Empty state: a frase dentro do cartão ──────────────────────────────────
  if (!project || project.sources.length === 0) {
    return (
      <div className="flex min-h-0 flex-1 overflow-auto px-8 py-7">
        <div className="h-fit rounded-lg bg-surface px-10 pt-9 pb-10 shadow-elev-2">
          <p className="text-body text-ink-muted">{t('tablePreview.empty')}</p>
        </div>
      </div>
    );
  }

  const syllables = flattenSyllables(project.text.words);
  const words = project.text.words;
  // Borda esquerda da coluna: rule-strong quando a sílaba abre uma palavra (exceto a primeira).
  const startsWord = (idx: number) => idx > 0 && isWordBoundary(words, idx - 1);
  const groups = tableRows(project);
  const sources = groups.flatMap((g) => g.sources);

  // ── Context menu handlers ────────────────────────────────────────────────────
  function handleCellClick(e: React.MouseEvent, sourceId: string, syllableIdx: number, unfilled: boolean) {
    e.stopPropagation();
    // Célula pendente: nada a remover nem a marcar além de recortar; vai direto a Recortes.
    if (unfilled) {
      onNavigateToEditor?.(sourceId, syllableIdx);
      return;
    }
    setMenu({ x: e.clientX, y: e.clientY, sourceId, syllableIdx });
  }

  function closeMenu() {
    setMenu(null);
  }

  function getMenuSource(): ManuscriptSource | undefined {
    if (!menu) return undefined;
    return sources.find(s => s.id === menu.sourceId);
  }

  function handleEditInEditor() {
    if (!menu) return;
    onNavigateToEditor?.(menu.sourceId, menu.syllableIdx);
  }

  function handleRemoveCrop() {
    if (!menu) return;
    const source = getMenuSource();
    if (!source) return;
    // Remove from syllableCuts and from syllableBoxes on all lines
    const newCuts = { ...source.syllableCuts };
    delete newCuts[menu.syllableIdx];
    const newLines = source.lines.map(line => {
      if (!line.syllableBoxes) return line;
      const boxes = { ...line.syllableBoxes };
      delete boxes[menu.syllableIdx];
      return { ...line, syllableBoxes: boxes };
    });
    dispatch({ type: 'UPDATE_SOURCE', payload: { ...source, syllableCuts: newCuts, lines: newLines } });
  }

  function handleMarkAsGap() {
    if (!menu) return;
    const source = getMenuSource();
    if (!source) return;
    // Find the line covering this syllable and toggle its box to null (explicit gap)
    const newLines = source.lines.map(line => {
      const { start, end } = line.syllableRange;
      if (menu.syllableIdx < start || menu.syllableIdx > end) return line;
      const boxes = { ...(line.syllableBoxes ?? {}) };
      // If currently a gap (null), unmark it (remove key → unfilled)
      if (boxes[menu.syllableIdx] === null) {
        delete boxes[menu.syllableIdx];
      } else {
        boxes[menu.syllableIdx] = null;
      }
      return { ...line, syllableBoxes: boxes };
    });
    // Also update syllableCuts: null = gap
    const newCuts = { ...source.syllableCuts };
    const wasGap = newCuts[menu.syllableIdx] === null;
    if (wasGap) {
      delete newCuts[menu.syllableIdx];
    } else {
      newCuts[menu.syllableIdx] = null;
    }
    dispatch({ type: 'UPDATE_SOURCE', payload: { ...source, lines: newLines, syllableCuts: newCuts } });
  }

  // Largura da tabela: coluna de metadados + N colunas de sílaba.
  const tableWidth = METADATA_COL_WIDTH + syllables.length * COL_WIDTH;
  const captionStyle = {
    fontSize: scale(BASE_CAPTION_FONT_SIZE),
    lineHeight: `${scale(BASE_CAPTION_LINE_HEIGHT)}px`,
  };

  // A área rola; o cabeçalho de sílabas e a coluna de metadados ficam fixos nela.
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="min-h-0 flex-1 overflow-auto px-8 py-7">
        <div className="flex w-max flex-col gap-5 rounded-lg bg-surface px-10 pt-9 pb-10 shadow-elev-2">
          <div>
            <h1 className="m-0 font-serif text-doc-title font-semibold text-ink">{title}</h1>
            {author && (
              <p data-testid="piece-author" className="m-0 text-label text-ink-muted">
                {author}
              </p>
            )}
          </div>

          <div style={{ width: tableWidth }}>
            {/* ── Cabeçalho: uma linha de sílabas, fixa no topo ── */}
            <div className="sticky top-0 z-20 flex border-b border-rule bg-surface">
              <div
                className="sticky left-0 z-30 flex-shrink-0 bg-surface"
                style={{ width: METADATA_COL_WIDTH, height: HEADER_ROW_HEIGHT }}
              />
              {syllables.map((syl, idx) => (
                <div
                  key={idx}
                  data-testid={`syllable-header-${idx}`}
                  className={[
                    'flex flex-shrink-0 items-center justify-center overflow-hidden border-l border-rule-soft font-serif text-ink',
                    startsWord(idx) ? 'border-l-rule-strong' : '',
                  ].join(' ')}
                  style={{ width: COL_WIDTH, height: HEADER_ROW_HEIGHT }}
                >
                  <span
                    className="truncate px-0.5 select-none"
                    style={{ fontSize: scale(BASE_SYL_FONT_SIZE) }}
                    title={syl}
                  >
                    {syl}
                  </span>
                </div>
              ))}
            </div>

            {groups.map((group) => (
              <div key={group.group.id ?? 'none'}>
                {/* ── Linha do grupo (só para grupos com nome) ── */}
                {group.group.name !== null && (
                  <div data-testid={`group-row-${group.group.id}`} className="pt-4 pb-1.5">
                    <span className="sticky left-0 inline-block text-caption font-semibold text-ink-muted">{group.group.name}</span>
                  </div>
                )}

                {group.sources.map((source) => {
                  // Ajustes de imagem da página que cobre a sílaba (a primeira página, se nenhuma cobrir).
                  const adjustmentsForSyllable = (syllableIdx: number) => {
                    const line = source.lines.find(
                      (l) => syllableIdx >= l.syllableRange.start && syllableIdx <= l.syllableRange.end,
                    );
                    return (line ?? source.lines[0])?.imageAdjustments;
                  };
                  const caption = sourceCaption(source);

                  return (
                    <div key={source.id} data-testid={`source-row-${source.id}`} className="flex">
                      {/* ── Metadados, fixos à esquerda ── */}
                      <div
                        className="sticky left-0 z-10 flex flex-shrink-0 flex-col justify-center border-b border-rule-soft bg-surface pr-4"
                        style={{ width: METADATA_COL_WIDTH, height: ROW_HEIGHT }}
                      >
                        <span
                          className="truncate font-serif font-medium text-ink"
                          style={{
                            fontSize: scale(BASE_SIGLUM_FONT_SIZE),
                            lineHeight: `${scale(BASE_SIGLUM_LINE_HEIGHT)}px`,
                          }}
                          title={source.metadata.siglum}
                        >
                          {source.metadata.siglum}
                        </span>
                        {caption && (
                          <span className="truncate text-ink-muted" style={captionStyle} title={caption}>
                            {caption}
                          </span>
                        )}
                      </div>

                      {/* ── Células ── */}
                      {syllables.map((_, idx) => {
                        const cellState = resolveCellState(source, idx);
                        return (
                          <TableCell
                            key={idx}
                            testId={`cell-${source.id}-${idx}`}
                            state={cellState}
                            startsWord={startsWord(idx)}
                            colWidthPx={COL_WIDTH}
                            rowHeightPx={ROW_HEIGHT}
                            onClick={(e) => handleCellClick(e, source.id, idx, cellState.kind === 'unfilled')}
                            adjustments={adjustmentsForSyllable(idx)}
                          />
                        );
                      })}
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── Context menu (D-06) ── */}
      {menu && (() => {
        const src = getMenuSource();
        if (!src) return null;
        const cellState = resolveCellState(src, menu.syllableIdx);
        return (
          <ContextMenu
            x={menu.x}
            y={menu.y}
            hasCrop={cellState.kind === 'filled'}
            isGap={cellState.kind === 'gap'}
            onEditInEditor={handleEditInEditor}
            onRemoveCrop={handleRemoveCrop}
            onMarkAsGap={handleMarkAsGap}
            onClose={closeMenu}
          />
        );
      })()}
    </div>
  );
}
