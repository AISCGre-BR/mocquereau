// src/shared/box-frame.ts
//
// Reference frame of syllable boxes (spec R1/R2). Boxes are fractions of the
// axis-aligned bounding box (AABB) of the image after flip + clockwise rotation,
// exactly what sliceUtils.computeSyllableCuts and ImageCanvas render.
// Forward map (original pixel -> view pixel):
//   u = (x - W/2) * (flipH ? -1 : 1),  v = (y - H/2) * (flipV ? -1 : 1)
//   X = u cos - v sin,  Y = u sin + v cos            (clockwise, y down)
//   view = (VW/2 + X, VH/2 + Y), VW = W|cos| + H|sin|, VH = W|sin| + H|cos|
import type { BoxFrame, SyllableBox } from "./project-schema";

export interface Size {
  width: number;
  height: number;
}

export interface Point {
  x: number;
  y: number;
}

export const IDENTITY_FRAME: BoxFrame = Object.freeze({ rotation: 0, flipH: false, flipV: false });

export function normalizeRotation(deg: number): number {
  if (!Number.isFinite(deg)) return 0;
  return ((deg % 360) + 360) % 360;
}

export function frameOf(adj?: Partial<BoxFrame> | null): BoxFrame {
  return {
    rotation: normalizeRotation(adj?.rotation ?? 0),
    flipH: !!adj?.flipH,
    flipV: !!adj?.flipV,
  };
}

export function framesEqual(a: BoxFrame, b: BoxFrame): boolean {
  return (
    normalizeRotation(a.rotation) === normalizeRotation(b.rotation) &&
    a.flipH === b.flipH &&
    a.flipV === b.flipV
  );
}

export function isQuarterTurn(deg: number): boolean {
  return normalizeRotation(deg) % 90 === 0;
}

export function hasAnyBox(boxes?: Record<number, SyllableBox | null> | null): boolean {
  if (!boxes) return false;
  return Object.values(boxes).some((b) => b != null);
}

function trig(deg: number): { cos: number; sin: number } {
  const r = normalizeRotation(deg);
  if (r === 0) return { cos: 1, sin: 0 };
  if (r === 90) return { cos: 0, sin: 1 };
  if (r === 180) return { cos: -1, sin: 0 };
  if (r === 270) return { cos: 0, sin: -1 };
  const rad = (r * Math.PI) / 180;
  return { cos: Math.cos(rad), sin: Math.sin(rad) };
}

export function viewSize(img: Size, frame: BoxFrame): Size {
  const { cos, sin } = trig(frame.rotation);
  const c = Math.abs(cos);
  const s = Math.abs(sin);
  return { width: img.width * c + img.height * s, height: img.width * s + img.height * c };
}

export function originalToView(p: Point, img: Size, frame: BoxFrame): Point {
  const { cos, sin } = trig(frame.rotation);
  const v = viewSize(img, frame);
  const u = (p.x - img.width / 2) * (frame.flipH ? -1 : 1);
  const w = (p.y - img.height / 2) * (frame.flipV ? -1 : 1);
  return { x: v.width / 2 + u * cos - w * sin, y: v.height / 2 + u * sin + w * cos };
}

export function viewToOriginal(p: Point, img: Size, frame: BoxFrame): Point {
  const { cos, sin } = trig(frame.rotation);
  const v = viewSize(img, frame);
  const X = p.x - v.width / 2;
  const Y = p.y - v.height / 2;
  const u = X * cos + Y * sin;
  const w = -X * sin + Y * cos;
  return {
    x: img.width / 2 + u * (frame.flipH ? -1 : 1),
    y: img.height / 2 + w * (frame.flipV ? -1 : 1),
  };
}

const EPS = 1e-9;

/** True when the view(from) -> view(to) map sends axis-aligned rects to axis-aligned rects. */
function relativeIsAxisAligned(from: BoxFrame, to: BoxFrame): boolean {
  const unit = { width: 1, height: 1 };
  const f = (p: Point) => originalToView(viewToOriginal(p, unit, from), unit, to);
  const o = f({ x: 0, y: 0 });
  const ex = f({ x: 1, y: 0 });
  const ey = f({ x: 0, y: 1 });
  const a = ex.x - o.x;
  const b = ex.y - o.y;
  const c = ey.x - o.x;
  const d = ey.y - o.y;
  return (Math.abs(b) < EPS && Math.abs(c) < EPS) || (Math.abs(a) < EPS && Math.abs(d) < EPS);
}

/** Parity of the nearest quarter turn; decides w/h transposition for free angles. */
function quarterParity(deg: number): number {
  return Math.round(normalizeRotation(deg) / 90) % 2;
}

export function remapBox(box: SyllableBox, img: Size, from: BoxFrame, to: BoxFrame): SyllableBox {
  if (framesEqual(from, to)) return { ...box };
  const fv = viewSize(img, from);
  const tv = viewSize(img, to);
  const map = (p: Point) => originalToView(viewToOriginal(p, img, from), img, to);

  if (relativeIsAxisAligned(from, to)) {
    const corners = [
      { x: box.x, y: box.y },
      { x: box.x + box.w, y: box.y },
      { x: box.x, y: box.y + box.h },
      { x: box.x + box.w, y: box.y + box.h },
    ].map((p) => map({ x: p.x * fv.width, y: p.y * fv.height }));
    const xs = corners.map((p) => p.x);
    const ys = corners.map((p) => p.y);
    const minX = Math.min(...xs);
    const minY = Math.min(...ys);
    return {
      x: minX / tv.width,
      y: minY / tv.height,
      w: (Math.max(...xs) - minX) / tv.width,
      h: (Math.max(...ys) - minY) / tv.height,
    };
  }

  // Free angle: keep the centre (exact point map) and the size in pixels,
  // transposed when the nearest quarter turn changes parity.
  const c = map({ x: (box.x + box.w / 2) * fv.width, y: (box.y + box.h / 2) * fv.height });
  let pw = box.w * fv.width;
  let ph = box.h * fv.height;
  if (quarterParity(from.rotation) !== quarterParity(to.rotation)) [pw, ph] = [ph, pw];
  return {
    x: (c.x - pw / 2) / tv.width,
    y: (c.y - ph / 2) / tv.height,
    w: pw / tv.width,
    h: ph / tv.height,
  };
}

export function remapBoxes(
  boxes: Record<number, SyllableBox | null>,
  img: Size,
  from: BoxFrame,
  to: BoxFrame,
): Record<number, SyllableBox | null> {
  if (framesEqual(from, to)) return boxes;
  if (!(img.width > 0) || !(img.height > 0)) return boxes;
  const out: Record<number, SyllableBox | null> = {};
  for (const [key, box] of Object.entries(boxes)) {
    out[Number(key)] = box ? remapBox(box, img, from, to) : null;
  }
  return out;
}
