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
import { toggleCellGap } from '../lib/syllable-gap';
import type { MenuCloseReason } from '../ui/Menu';
import { TableCell, type CellAnchor } from './table-preview/TableCell';
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

// Paddings da área (px-8) e do cartão (px-10), fixos em qualquer zoom.
// O Chromium prende o sticky dentro do padding da área de rolagem; por isso
// o que é fixo à esquerda usa left = -SCROLL_PAD_X (encosta na borda da área)
// e se estende para a esquerda por CARD_PAD_X com o fundo do cartão: na
// rolagem horizontal as células passam por baixo, nunca à esquerda dele.
const SCROLL_PAD_X = 32;
const CARD_PAD_X = 40;
const STICKY_LEFT = { left: -SCROLL_PAD_X, paddingLeft: CARD_PAD_X } as const;

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
  /** The cell that opened the menu: it gets the focus back when the menu closes. */
  cell: HTMLElement;
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
  function openMenu(sourceId: string, syllableIdx: number, anchor: CellAnchor) {
    setMenu({ x: anchor.x, y: anchor.y, sourceId, syllableIdx, cell: anchor.cell });
  }

  function handleCellActivate(sourceId: string, syllableIdx: number, unfilled: boolean, anchor: CellAnchor) {
    // Célula pendente: nada a remover nem a marcar além de recortar; vai direto a Recortes.
    if (unfilled) {
      onNavigateToEditor?.(sourceId, syllableIdx);
      return;
    }
    openMenu(sourceId, syllableIdx, anchor);
  }

  function closeMenu(reason: MenuCloseReason) {
    const cell = menu?.cell;
    setMenu(null);
    if (reason !== 'outside') cell?.focus();
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

  /** "Sem neuma nesta página": the same toggle as Recortes, on the page that decides the cell. */
  function handleToggleGap() {
    if (!menu) return;
    const source = getMenuSource();
    if (!source) return;
    dispatch({ type: 'UPDATE_SOURCE', payload: toggleCellGap(source, menu.syllableIdx) });
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
      <div className="min-h-0 flex-1 overflow-auto py-7" style={{ paddingInline: SCROLL_PAD_X }}>
        <div
          className="flex w-max flex-col gap-5 rounded-lg bg-surface pt-9 pb-10 shadow-elev-2"
          style={{ paddingInline: CARD_PAD_X }}
        >
          <div>
            <h1 className="m-0 font-serif text-doc-title font-semibold text-ink">{title}</h1>
            {author && (
              <p data-testid="piece-author" className="m-0 text-label text-ink-muted">
                {author}
              </p>
            )}
          </div>

          {/* A tabela começa na borda do cartão: a coluna fixa cobre o padding (ver STICKY_LEFT). */}
          <div style={{ width: CARD_PAD_X + tableWidth, marginLeft: -CARD_PAD_X }}>
            {/* ── Cabeçalho: uma linha de sílabas, fixa no topo ── */}
            <div className="sticky top-0 z-20 flex bg-surface">
              <div
                className="sticky z-30 box-content flex-shrink-0 bg-surface"
                style={{ ...STICKY_LEFT, width: METADATA_COL_WIDTH, height: HEADER_ROW_HEIGHT }}
              >
                <div className="h-full border-b border-rule" />
              </div>
              {syllables.map((syl, idx) => (
                <div
                  key={idx}
                  data-testid={`syllable-header-${idx}`}
                  className={[
                    'flex flex-shrink-0 items-center justify-center overflow-hidden border-b border-l border-rule-soft border-b-rule font-serif text-ink',
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
                    <span className="sticky inline-block text-caption font-semibold text-ink-muted" style={STICKY_LEFT}>
                      {group.group.name}
                    </span>
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
                        className="sticky z-10 box-content flex-shrink-0 bg-surface"
                        style={{ ...STICKY_LEFT, width: METADATA_COL_WIDTH, height: ROW_HEIGHT }}
                      >
                        <div className="flex h-full flex-col justify-center border-b border-rule-soft pr-4">
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
                            ariaLabel={t(cellState.kind === 'unfilled' ? 'tableCell.cropAt' : 'tableCell.actions', {
                              syllable: syllables[idx],
                              siglum: source.metadata.siglum,
                            })}
                            onActivate={(anchor) => handleCellActivate(source.id, idx, cellState.kind === 'unfilled', anchor)}
                            onOpenMenu={(anchor) => openMenu(source.id, idx, anchor)}
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
            onToggleGap={handleToggleGap}
            onClose={closeMenu}
          />
        );
      })()}
    </div>
  );
}
