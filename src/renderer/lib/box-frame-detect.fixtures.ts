// Synthetic manuscript pages for the box-frame tests (not a test file itself).
import type { BoxFrame, SyllableBox } from "@shared/project-schema";
import { originalToView, viewSize } from "@shared/box-frame";
import type { RasterLike } from "./box-frame-detect";

export interface Blob {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** White page with small black "neumes" (axis-aligned in the ORIGINAL image). */
export function page(width: number, height: number, blobs: Blob[]): RasterLike {
  const data = new Uint8ClampedArray(width * height * 4).fill(255);
  for (const b of blobs) {
    for (let y = b.y; y < b.y + b.h; y++) {
      for (let x = b.x; x < b.x + b.w; x++) {
        const p = (y * width + x) * 4;
        data[p] = data[p + 1] = data[p + 2] = 20;
      }
    }
  }
  return { data, width, height };
}

/** Neumes spread over the page, so a 5 degree turn moves the edge ones clearly. */
export function blobs(width: number, height: number): Blob[] {
  const out: Blob[] = [];
  for (let row = 0; row < 3; row++) {
    for (let col = 0; col < 8; col++) {
      out.push({
        x: Math.round(20 + (col * (width - 50)) / 7),
        y: Math.round(30 + (row * (height - 70)) / 2),
        w: 10,
        h: 12,
      });
    }
  }
  return out;
}

/** Boxes around each blob as the user would draw them in the view of `frame`. */
export function boxesIn(frame: BoxFrame, img: { width: number; height: number }, list: Blob[]): Record<number, SyllableBox> {
  const v = viewSize(img, frame);
  const out: Record<number, SyllableBox> = {};
  list.forEach((b, i) => {
    const c = originalToView({ x: b.x + b.w / 2, y: b.y + b.h / 2 }, img, frame);
    const quarter = Math.round(frame.rotation / 90) % 2 === 1;
    const pw = (quarter ? b.h : b.w) + 6;
    const ph = (quarter ? b.w : b.h) + 6;
    out[i] = { x: (c.x - pw / 2) / v.width, y: (c.y - ph / 2) / v.height, w: pw / v.width, h: ph / v.height };
  });
  return out;
}

