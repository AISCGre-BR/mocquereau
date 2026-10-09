// src/shared/band-order.ts
//
// Reading order of a page's neume line bands (S7): bands whose vertical
// overlap exceeds half the smaller height share a row; rows go top to bottom
// and bands in a row left to right. One helper for the reducer, the canvas
// and the file validator, so an index names the same band everywhere.

interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

function sameRow(a: Rect, b: Rect): boolean {
  const overlap = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
  return overlap > 0.5 * Math.min(a.h, b.h);
}

export function orderNeumeBands<T extends Rect>(bands: readonly T[]): T[] {
  const byTop = [...bands].sort((a, b) => a.y - b.y || a.x - b.x);
  const rows: T[][] = [];
  for (const band of byTop) {
    const row = rows[rows.length - 1];
    if (row && row.some((r) => sameRow(r, band))) row.push(band);
    else rows.push([band]);
  }
  return rows.flatMap((row) => row.sort((a, b) => a.x - b.x || a.y - b.y));
}
