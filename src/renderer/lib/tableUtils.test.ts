import { describe, it, expect } from 'vitest';
import { resolveCellState, firstFolio, appendLineConsumingFolioHint } from './tableUtils';
import type { ManuscriptSource } from './models';

const ADJ = { brightness: 100, contrast: 100, saturation: 100, grayscale: 0, invert: false, flipH: false, flipV: false };

function source(lineExtra: Partial<ManuscriptSource['lines'][number]>): ManuscriptSource {
  return {
    id: 's1',
    order: 1,
    metadata: { siglum: 'A', library: '', city: '', century: '', classes: [null, null, null] },
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

describe('firstFolio', () => {
  it('returns the first non-blank page folio, trimmed', () => {
    const s = source({});
    s.lines = [{ ...s.lines[0], folio: undefined }, { ...s.lines[0], id: 'l2', folio: ' 3v ' }];
    expect(firstFolio(s)).toBe('3v');
  });
  it('returns empty string without pages', () => {
    const s = source({});
    s.lines = [];
    expect(firstFolio(s)).toBe('');
  });
});

describe('appendLineConsumingFolioHint', () => {
  it('moves the hint to the new line and drops it from the metadata', () => {
    const s = source({});
    s.lines = [];
    s.metadata.folioHint = '12r';
    const line = { ...source({}).lines[0], id: 'n', folio: undefined };
    const out = appendLineConsumingFolioHint(s, line);
    expect(out.lines[0].folio).toBe('12r');
    expect('folioHint' in out.metadata).toBe(false);
  });
  it('keeps an explicit folio of the new line and still drops the hint', () => {
    const s = source({});
    s.metadata.folioHint = '12r';
    const line = { ...s.lines[0], id: 'n', folio: '5v' };
    const out = appendLineConsumingFolioHint(s, line);
    expect(out.lines.at(-1)!.folio).toBe('5v');
    expect(out.metadata.folioHint).toBeUndefined();
  });
  it('is a plain append without a hint', () => {
    const s = source({});
    const out = appendLineConsumingFolioHint(s, { ...s.lines[0], id: 'n' });
    expect(out.lines).toHaveLength(2);
    expect(out.metadata).toBe(s.metadata);
  });
});

describe('resolveCellState — overlapping pages', () => {
  const IMG = { dataUrl: 'data:,', width: 200, height: 100, mimeType: 'image/png' };
  const BOX = { x: 0, y: 0, w: 0.25, h: 0.5 };
  const line = (id: string, start: number, end: number, extra: Partial<ManuscriptSource['lines'][number]> = {}) => ({
    id, image: IMG, syllableRange: { start, end }, dividers: [], gaps: [], confirmed: true, syllableBoxes: {}, ...extra,
  });
  const src = (lines: ManuscriptSource['lines']): ManuscriptSource => ({
    id: 's1', order: 1, metadata: { siglum: 'A', library: '', city: '', century: '', classes: [null, null, null] },
    lines, syllableCuts: {},
  });

  it('falls through to the next page covering the syllable when the first has no entry there', () => {
    const s = src([line('l1', 0, 5, { syllableBoxes: { 0: BOX } }), line('l2', 3, 5, { syllableBoxes: { 4: BOX } })]);
    const st = resolveCellState(s, 4);
    expect(st.kind).toBe('filled');
    if (st.kind === 'filled') expect(st.image).toBe(s.lines[1].image);
    expect(resolveCellState(s, 5).kind).toBe('unfilled');
  });

  it('a gap on the first covering page wins (no fall-through)', () => {
    const s = src([line('l1', 0, 5, { gaps: [4] }), line('l2', 3, 5, { syllableBoxes: { 4: BOX } })]);
    expect(resolveCellState(s, 4).kind).toBe('gap');
  });

  it('a box on the first covering page wins over a later one', () => {
    const first = { x: 0.5, y: 0, w: 0.1, h: 0.1 };
    const s = src([line('l1', 0, 5, { syllableBoxes: { 4: first } }), line('l2', 3, 5, { syllableBoxes: { 4: BOX } })]);
    const st = resolveCellState(s, 4);
    expect(st.kind === 'filled' && st.box).toEqual(first);
  });

  it('a removed box (key absent) is pending and falls through to the next page', () => {
    const s = src([line('l1', 0, 5, { syllableBoxes: { 1: BOX } }), line('l2', 0, 5, { syllableBoxes: { 4: BOX } })]);
    expect(resolveCellState(s, 4).kind).toBe('filled');
    expect(resolveCellState(s, 0).kind).toBe('unfilled');
  });

  it('a legacy null box is still a gap', () => {
    const s = src([line('l1', 0, 5, { syllableBoxes: { 4: null } }), line('l2', 0, 5, { syllableBoxes: { 4: BOX } })]);
    expect(resolveCellState(s, 4).kind).toBe('gap');
  });
});
