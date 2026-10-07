// src/renderer/lib/legacy-crop.r4.test.ts
//
// T1 / spec R4, not circular: the expected pixel regions below are HARD-CODED
// from the v0.0.5 crop algorithm (git show bf8cf5c:src/renderer/lib/sliceUtils.ts)
// and from canvas transform semantics, never from @shared/box-frame.
//
// Image 300 x 120. v0.0.5 stored canonical boxes (fractions of the ORIGINAL):
//   box { x: 0.1, y: 0.25, w: 0.3, h: 0.5 }
//   v0.0.5: sx = round(0.1*300) = 30, sy = round(0.25*120) = 30,
//           sw = round(0.3*300) = 90, sh = round(0.5*120) = 60
//   => original pixels x in [30,120], y in [30,90]; output 90deg = 60 x 90
//      (outW = sh, outH = sw), flipH = 90 x 60.
//
// Today's crop pre-renders the whole image into its rotated AABB with
//   translate(AW/2, AH/2); rotate(theta); scale(fx, fy); drawImage(img, -W/2, -H/2)
// so an original pixel (x, y) lands at:
//   rotation 90 (AABB 120 x 300): (x', y') = (120 - y, x)
//     => region x' in [120-90, 120-30] = [30, 90], y' in [30, 120]  => (30, 30, 60, 90)
//   flipH, rotation 0 (AABB 300 x 120): (x', y') = (300 - x, y)
//     => region x' in [300-120, 300-30] = [180, 270], y' in [30, 90] => (180, 30, 90, 60)
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ImageAdjustments, ManuscriptLine } from './models';
import { boxesInView } from '@shared/box-frame';

class MockImage {
  onload: (() => void) | null = null;
  onerror: ((e: unknown) => void) | null = null;
  set src(_v: string) {
    Promise.resolve().then(() => this.onload?.());
  }
}
vi.stubGlobal('Image', MockImage);

const ctxs: Array<{ drawImage: ReturnType<typeof vi.fn>; canvas: { width: number; height: number } }> = [];
vi.stubGlobal('document', {
  createElement: vi.fn(() => {
    const canvas = {
      width: 0,
      height: 0,
      getContext: vi.fn(() => ctx),
      toDataURL: vi.fn(() => 'data:image/png;base64,AA=='),
    };
    const ctx = {
      drawImage: vi.fn(),
      translate: vi.fn(),
      rotate: vi.fn(),
      scale: vi.fn(),
      filter: 'none',
      canvas,
    };
    ctxs.push(ctx);
    return canvas;
  }),
});

const ADJ = { brightness: 100, contrast: 100, saturation: 100, grayscale: 0, invert: false };
const IMAGE = { dataUrl: 'data:image/png;base64,AA==', width: 300, height: 120, mimeType: 'image/png' };
const CANONICAL = { x: 0.1, y: 0.25, w: 0.3, h: 0.5 };

function line(extra: Partial<ManuscriptLine>): ManuscriptLine {
  return {
    id: 'l',
    image: IMAGE,
    syllableRange: { start: 0, end: 0 },
    dividers: [],
    gaps: [],
    confirmed: true,
    ...extra,
  };
}

/** Crop rectangle (in the pre-rendered AABB) and output size for syllable 0. */
async function crop(l: ManuscriptLine) {
  const { computeSyllableCuts } = await import('./sliceUtils');
  ctxs.length = 0;
  const cuts = await computeSyllableCuts(l.image, boxesInView(l), l.syllableRange, l.imageAdjustments);
  const last = ctxs[ctxs.length - 1];
  const [, sx, sy, sw, sh] = last.drawImage.mock.calls[0];
  return { rect: [sx, sy, sw, sh], out: [cuts[0]!.width, cuts[0]!.height] };
}

describe('R4 fixture — v0.0.5 canonical boxes crop the v0.0.5 pixels (hard-coded)', () => {
  beforeEach(() => vi.clearAllMocks());

  it('rotation 90: v0.0.5 file (boxes in the identity frame)', async () => {
    const adj: ImageAdjustments = { ...ADJ, rotation: 90, flipH: false, flipV: false };
    const r = await crop(line({
      syllableBoxes: { 0: CANONICAL },
      imageAdjustments: adj,
      boxFrame: { rotation: 0, flipH: false, flipV: false },
    }));
    expect(r.rect).toEqual([30, 30, 60, 90]);
    expect(r.out).toEqual([60, 90]);
  });

  it('rotation 90: the same ink saved by v0.0.6 (boxes in the rotated view) crops the same pixels', async () => {
    const adj: ImageAdjustments = { ...ADJ, rotation: 90, flipH: false, flipV: false };
    const r = await crop(line({
      syllableBoxes: { 0: { x: 30 / 120, y: 30 / 300, w: 60 / 120, h: 90 / 300 } },
      imageAdjustments: adj,
      boxFrame: { rotation: 90, flipH: false, flipV: false },
    }));
    expect(r.rect).toEqual([30, 30, 60, 90]);
    expect(r.out).toEqual([60, 90]);
  });

  it('flipH: v0.0.5 file (boxes in the identity frame)', async () => {
    const adj: ImageAdjustments = { ...ADJ, rotation: 0, flipH: true, flipV: false };
    const r = await crop(line({
      syllableBoxes: { 0: CANONICAL },
      imageAdjustments: adj,
      boxFrame: { rotation: 0, flipH: false, flipV: false },
    }));
    expect(r.rect).toEqual([180, 30, 90, 60]);
    expect(r.out).toEqual([90, 60]);
  });

  it('flipH: the same ink saved by v0.0.6 crops the same pixels', async () => {
    const adj: ImageAdjustments = { ...ADJ, rotation: 0, flipH: true, flipV: false };
    const r = await crop(line({
      syllableBoxes: { 0: { x: 180 / 300, y: 30 / 120, w: 90 / 300, h: 60 / 120 } },
      imageAdjustments: adj,
      boxFrame: { rotation: 0, flipH: true, flipV: false },
    }));
    expect(r.rect).toEqual([180, 30, 90, 60]);
    expect(r.out).toEqual([90, 60]);
  });
});
