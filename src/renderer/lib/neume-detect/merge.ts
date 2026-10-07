// SPDX-License-Identifier: GPL-3.0-or-later
// Contem codigo portado de Othmar neo (othmar/candidates.py, AGPL-3.0-or-later), de autoria
// exclusiva de Gabriel Honorato Teixeira Bernardo, relicenciado pelo autor sob GPL-3.0-or-later.
// Ver NOTICE.
// Fusao gulosa de caixas vizinhas. Porte de merge_boxes() de othmar/candidates.py.
import type { PxBox } from './types';

export interface MergedBox extends PxBox {
  /** Indices (na lista de entrada) das caixas fundidas aqui, em ordem crescente. */
  members: number[];
}

/**
 * Funde caixas cuja folga horizontal <= gapX e vertical <= gapY (folga 0 se sobrepoem), desde que a
 * uniao caiba em maxW x maxH. Guloso, pares mais proximos primeiro (distancia^2 das folgas, empate
 * na ordem de varredura i < j), um par por caixa por rodada; repete ate nao haver par.
 * Saida ordenada por (y, x), como o lexsort do original.
 */
export function mergeBoxesIndexed(
  boxes: PxBox[],
  gapX: number,
  gapY: number,
  maxW: number,
  maxH: number,
): MergedBox[] {
  let cur: MergedBox[] = boxes.map((b, i) => ({ x: b.x, y: b.y, w: b.w, h: b.h, members: [i] }));
  while (cur.length > 1) {
    const pairs: { i: number; j: number; d: number }[] = [];
    for (let i = 0; i < cur.length; i++) {
      const a = cur[i];
      for (let j = i + 1; j < cur.length; j++) {
        const b = cur[j];
        const gx = Math.max(0, Math.max(a.x, b.x) - Math.min(a.x + a.w, b.x + b.w));
        const gy = Math.max(0, Math.max(a.y, b.y) - Math.min(a.y + a.h, b.y + b.h));
        if (gx > gapX || gy > gapY) continue;
        const uw = Math.max(a.x + a.w, b.x + b.w) - Math.min(a.x, b.x);
        const uh = Math.max(a.y + a.h, b.y + b.h) - Math.min(a.y, b.y);
        if (uw > maxW || uh > maxH) continue;
        pairs.push({ i, j, d: gx * gx + gy * gy });
      }
    }
    if (pairs.length === 0) break;
    pairs.sort((p, q) => p.d - q.d || p.i - q.i || p.j - q.j);
    const used = new Uint8Array(cur.length);
    const fused: MergedBox[] = [];
    for (const { i, j } of pairs) {
      if (used[i] || used[j]) continue;
      used[i] = 1;
      used[j] = 1;
      const a = cur[i];
      const b = cur[j];
      const x = Math.min(a.x, b.x);
      const y = Math.min(a.y, b.y);
      fused.push({
        x,
        y,
        w: Math.max(a.x + a.w, b.x + b.w) - x,
        h: Math.max(a.y + a.h, b.y + b.h) - y,
        members: [...a.members, ...b.members].sort((p, q) => p - q),
      });
    }
    cur = [...cur.filter((_, t) => !used[t]), ...fused];
  }
  return cur.sort((a, b) => a.y - b.y || a.x - b.x);
}

export function mergeBoxes(boxes: PxBox[], gapX: number, gapY: number, maxW: number, maxH: number): PxBox[] {
  return mergeBoxesIndexed(boxes, gapX, gapY, maxW, maxH).map(({ x, y, w, h }) => ({ x, y, w, h }));
}
