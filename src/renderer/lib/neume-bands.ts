// src/renderer/lib/neume-bands.ts
//
// Neume line bands of a page (S7): kept sorted top to bottom (ties: left to
// right), so an index into the list names the same band in the canvas, the
// selection and the project.

import type { SyllableBox } from "./models";

export function sortNeumeBands(bands: readonly SyllableBox[]): SyllableBox[] {
  return [...bands].sort((a, b) => a.y - b.y || a.x - b.x);
}

export function sameNeumeBands(a: readonly SyllableBox[] | undefined, b: readonly SyllableBox[]): boolean {
  return (
    a?.length === b.length &&
    a.every((r, i) => r.x === b[i].x && r.y === b[i].y && r.w === b[i].w && r.h === b[i].h)
  );
}
