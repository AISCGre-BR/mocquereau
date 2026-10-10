// SPDX-License-Identifier: GPL-3.0-or-later
// Contem codigo portado de Othmar neo (othmar/candidates.py, AGPL-3.0-or-later), de autoria
// exclusiva de Gabriel Honorato Teixeira Bernardo, relicenciado pelo autor sob GPL-3.0-or-later.
// Ver NOTICE.
// Rejeicao de manchas escuras. Porte de dark_blobs() de othmar/candidates.py.
import { labelComponents } from './components';
import { maskedMedian } from './image';
import { dilateRect, openDisk } from './morphology';
import type { Params } from './scale';
import type { GrayImage, Mask } from './types';

/**
 * Furos, borroes e manchas de tinta grandes: muito escuros (< darkThr x mediana do pergaminho)
 * e largos (sobrevivem a uma abertura por disco octogonal de diametro darkOpen; tracos de neuma
 * sao finos).
 * Dilatado por darkMargin para pegar componentes coladas na mancha.
 */
export function darkBlobs(gray: GrayImage, valid: Mask | null, p: Params): Mask {
  const thr = p.darkThr * maskedMedian(gray, valid);
  const d = new Uint8Array(gray.data.length);
  for (let i = 0; i < d.length; i++) d[i] = gray.data[i] < thr && (!valid || valid.data[i]) ? 1 : 0;
  const opened = openDisk({ data: d, width: gray.width, height: gray.height }, p.darkOpen);
  return dilateRect(opened, 2 * p.darkMargin + 1);
}

/** Escuro como em darkBlobs: abaixo desta fracao da mediana do pergaminho. */
const BORDER_DARK = 0.35;
/** Extensao minima ao longo da borda do raster tocada (fracao do lado). */
const BORDER_MIN_EXTENT = 0.5;
/** Espessura media minima (area / extensao, px): linhas de pauta pretas (t ~ 2 a 5 px) nao entram. */
const BORDER_MIN_THICKNESS = 8;
/** Preenchimento minimo da caixa: pauta ligada por notas e linhas de texto escuras sao vazadas. */
const BORDER_MIN_FILL = 0.5;
/** Margem (px) para a transicao antisserrilhada entre a borda e o pergaminho. */
const BORDER_MARGIN = 2;

/**
 * Borda do scan (fundo preto fora do pergaminho): regiao muito escura e cheia que toca uma borda do
 * raster e se estende por ao menos metade dela. Nao e tinta: deve ser tratada como pixel fora da
 * imagem, senao seus runs (do tamanho da faixa preta cortada pela area) dominam a moda de u e todos
 * os filtros escalam com um u inflado. Devolve a mascara (com margem) ou null se nao houver.
 */
export function scanBorder(gray: GrayImage, valid: Mask | null): Mask | null {
  const { width: w, height: h } = gray;
  const thr = BORDER_DARK * maskedMedian(gray, valid);
  const d = new Uint8Array(w * h);
  for (let i = 0; i < d.length; i++) d[i] = gray.data[i] < thr && (!valid || valid.data[i]) ? 1 : 0;
  const lab = labelComponents({ data: d, width: w, height: h });
  const keep = new Set<number>();
  for (const c of lab.components) {
    const horiz = (c.y === 0 || c.y + c.h === h) && c.w >= BORDER_MIN_EXTENT * w;
    const vert = (c.x === 0 || c.x + c.w === w) && c.h >= BORDER_MIN_EXTENT * h;
    if (!horiz && !vert) continue;
    const extent = horiz ? c.w : c.h;
    if (c.area / extent < BORDER_MIN_THICKNESS || c.area < BORDER_MIN_FILL * c.w * c.h) continue;
    keep.add(c.label);
  }
  if (!keep.size) return null;
  const out = new Uint8Array(w * h);
  for (let i = 0; i < out.length; i++) if (keep.has(lab.labels[i])) out[i] = 1;
  return dilateRect({ data: out, width: w, height: h }, 2 * BORDER_MARGIN + 1);
}
