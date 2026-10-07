import { describe, it, expect } from 'vitest';
import { resolveCellState } from './tableUtils';
import type { ManuscriptSource } from './models';

const ADJ = { brightness: 100, contrast: 100, saturation: 100, grayscale: 0, invert: false, flipH: false, flipV: false };

function source(lineExtra: Partial<ManuscriptSource['lines'][number]>): ManuscriptSource {
  return {
    id: 's1',
    order: 1,
    metadata: { siglum: 'A', library: '', city: '', century: '', folio: '', notation: 'square' },
    lines: [{
      id: 'l1',
      image: { dataUrl: 'data:,', width: 200, height: 100, mimeType: 'image/png' },
      syllableRange: { start: 0, end: 1 },
      dividers: [],
      gaps: [],
      confirmed: true,
      syllableBoxes: { 0: { x: 0, y: 0, w: 0.25, h: 0.5 }, 1: null },
      ...lineExtra,
    }],
    syllableCuts: {},
  };
}

describe('resolveCellState — boxes are shown in the current frame (S6/S7)', () => {
  it('maps a box drawn at 0 degrees into the 90 degree view', () => {
    const st = resolveCellState(source({
      imageAdjustments: { ...ADJ, rotation: 90 },
      boxFrame: { rotation: 0, flipH: false, flipV: false },
    }), 0);
    expect(st.kind).toBe('filled');
    if (st.kind !== 'filled') return;
    expect(st.box.x).toBeCloseTo(0.5, 9);
    expect(st.box.y).toBeCloseTo(0, 9);
    expect(st.box.w).toBeCloseTo(0.5, 9);
    expect(st.box.h).toBeCloseTo(0.25, 9);
  });

  it('keeps gaps and boxes already in the current frame', () => {
    const src = source({});
    const st = resolveCellState(src, 0);
    expect(st.kind === 'filled' && st.box).toBe(src.lines[0].syllableBoxes![0]);
    expect(resolveCellState(src, 1).kind).toBe('gap');
  });
});
