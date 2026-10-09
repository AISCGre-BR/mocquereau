// src/renderer/lib/neume-bands.ts
//
// Neume line bands of a page (S7): kept in reading order (rows top to bottom,
// left to right in a row; see @shared/band-order), so an index into the list
// names the same band in the canvas, the selection and the project.

import { orderNeumeBands } from "@shared/band-order";
import type { SyllableBox } from "./models";

export function sortNeumeBands(bands: readonly SyllableBox[]): SyllableBox[] {
  return orderNeumeBands(bands);
}

export function sameNeumeBands(a: readonly SyllableBox[] | undefined, b: readonly SyllableBox[]): boolean {
  return (
    a?.length === b.length &&
    a.every((r, i) => r.x === b[i].x && r.y === b[i].y && r.w === b[i].w && r.h === b[i].h)
  );
}
