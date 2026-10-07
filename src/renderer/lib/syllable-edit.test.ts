import { describe, it, expect } from 'vitest';
import { SUGGESTED_CLASSIFICATION } from '@shared/classification';
import { mergeSyllables, replaceWordSyllables, splitSyllable } from './syllable-edit';
import type { MocquereauProject, StoredImage, SyllableBox } from './models';

const BOX: SyllableBox[] = [0, 1, 2, 3, 4].map((i) => ({ x: i / 10, y: 0, w: 0.1, h: 1 }));
const IMG: StoredImage = { dataUrl: 'data:image/png;base64,abc', width: 1, height: 1, mimeType: 'image/png' };

function base(): MocquereauProject {
  return {
    meta: { title: 't', author: 'a', createdAt: '2026-01-01', updatedAt: '2026-01-01' },
    text: {
      raw: 'Dominus dixit',
      words: [
        { original: 'Dominus', syllables: ['Do', 'mi', 'nus'] },
        { original: 'dixit', syllables: ['di', 'xit'] },
      ],
      hyphenationMode: 'sung',
    },
    sections: [],
    classification: SUGGESTED_CLASSIFICATION,
    sources: [
      {
        id: 's1',
        order: 0,
        metadata: { siglum: 'X', library: '', city: '', century: '', classes: [null, null, null] },
        lines: [
          {
            id: 'l1',
            image: IMG,
            syllableRange: { start: 0, end: 4 },
            dividers: [],
            gaps: [3],
            syllableBoxes: { 0: BOX[0], 1: BOX[1], 2: BOX[2], 3: BOX[3], 4: BOX[4] },
            confirmed: true,
          },
        ],
        syllableCuts: { 4: IMG },
      },
    ],
  } as MocquereauProject;
}

describe('replaceWordSyllables', () => {
  it('splitting shifts later boxes, ranges, gaps and cuts', () => {
    const p = replaceWordSyllables(base(), 0, ['Do', 'm', 'i', 'nus']);
    const l = p.sources[0].lines[0];
    expect(Object.keys(l.syllableBoxes!).map(Number).sort((a, b) => a - b)).toEqual([0, 1, 3, 4, 5]);
    expect(l.syllableBoxes![1]).toEqual(BOX[1]);
    expect(l.syllableBoxes![2]).toBeUndefined();
    expect(l.syllableRange).toEqual({ start: 0, end: 5 });
    expect(l.gaps).toEqual([4]);
    expect(Object.keys(p.sources[0].syllableCuts)).toEqual(['5']);
  });
  it('merging keeps the first box and shifts the rest back', () => {
    const p = replaceWordSyllables(base(), 1, ['dixit']);
    const l = p.sources[0].lines[0];
    expect(l.syllableBoxes![3]).toEqual(BOX[3]);
    expect(l.syllableBoxes![4]).toBeUndefined();
    expect(l.syllableRange).toEqual({ start: 0, end: 3 });
  });
  it('merge falls back to the second box when the first is a gap; range stays valid', () => {
    const b = base();
    b.sources[0].lines[0].syllableBoxes![3] = null;
    b.sources[0].lines[0].syllableRange = { start: 4, end: 4 };
    const p = replaceWordSyllables(b, 1, ['dixit']);
    const l = p.sources[0].lines[0];
    expect(l.syllableBoxes![3]).toEqual(BOX[4]);
    expect(l.syllableRange).toEqual({ start: 3, end: 3 });
    expect(p.sources[0].syllableCuts[3]).toEqual(IMG);
  });
  it('does not mutate its input', () => {
    const b = base();
    const snap = JSON.stringify(b);
    replaceWordSyllables(b, 0, ['Domi', 'nus']);
    expect(JSON.stringify(b)).toBe(snap);
  });
});

describe('split/merge helpers', () => {
  it('reject invalid positions and never create empty syllables', () => {
    const w = [{ original: 'me', syllables: ['me'] }];
    expect(splitSyllable(w, 0, 0, 0)).toBeNull();
    expect(splitSyllable(w, 0, 0, 2)).toBeNull();
    expect(splitSyllable(w, 0, 0, 1)![0].syllables).toEqual(['m', 'e']);
    expect(mergeSyllables(w, 0, 0)).toBeNull();
  });
});
