// SPDX-License-Identifier: GPL-3.0-or-later
// Contem codigo portado de Othmar neo (othmar/candidates.py, AGPL-3.0-or-later), de autoria
// exclusiva de Gabriel Honorato Teixeira Bernardo, relicenciado pelo autor sob GPL-3.0-or-later.
// Ver NOTICE.
// Rejeicao de manchas escuras. Porte de dark_blobs() de othmar/candidates.py.
import { maskedMedian } from './image';
import { dilateRect, openEllipse } from './morphology';
import type { Params } from './scale';
import type { GrayImage, Mask } from './types';

/**
 * Furos, borroes e manchas de tinta grandes: muito escuros (< darkThr x mediana do pergaminho)
 * e largos (sobrevivem a uma abertura de diametro darkOpen; tracos de neuma sao finos).
 * Dilatado por darkMargin para pegar componentes coladas na mancha.
 */
export function darkBlobs(gray: GrayImage, valid: Mask | null, p: Params): Mask {
  const thr = p.darkThr * maskedMedian(gray, valid);
  const d = new Uint8Array(gray.data.length);
  for (let i = 0; i < d.length; i++) d[i] = gray.data[i] < thr && (!valid || valid.data[i]) ? 1 : 0;
  const opened = openEllipse({ data: d, width: gray.width, height: gray.height }, p.darkOpen);
  return dilateRect(opened, 2 * p.darkMargin + 1);
}
