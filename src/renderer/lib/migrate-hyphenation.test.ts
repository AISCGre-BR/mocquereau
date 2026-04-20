// src/renderer/lib/migrate-hyphenation.test.ts

import { describe, it, expect } from 'vitest';
import { migrateHyphenation, previewMigration } from './migrate-hyphenation';
import type { MocquereauProject } from './models';

// ── Fixture ───────────────────────────────────────────────────────────────────
function makeProject(overrides: Partial<MocquereauProject> = {}): MocquereauProject {
  return {
    meta: { title: 't', author: 'a', createdAt: '2026-01-01', updatedAt: '2026-01-01' },
    text: {
      raw: 'omnípotens bonae propter',
      // Typographic split (old): omnípotens = [om, ní, pot, ens] = 4, bonae = [bo, na, e] = 3, propter = [prop, ter] = 2
      // Global indices: om=0, ní=1, pot=2, ens=3, bo=4, na=5, e=6, prop=7, ter=8
      words: [
        { original: 'omnípotens', syllables: ['om', 'ní', 'pot', 'ens'] },
        { original: 'bonae', syllables: ['bo', 'na', 'e'] },
        { original: 'propter', syllables: ['prop', 'ter'] },
      ],
      hyphenationMode: 'liturgical-typographic',
    },
    sections: [],
    sources: [
      {
        id: 's1',
        order: 0,
        metadata: {
          siglum: 'X', library: '', city: '', century: '', folio: '', notation: 'square',
        },
        lines: [
          {
            id: 'l1',
            image: { dataUrl: 'data:image/png;base64,abc', width: 100, height: 50, mimeType: 'image/png' },
            syllableRange: { start: 0, end: 8 },
            dividers: [],
            gaps: [3],
            syllableBoxes: {
              0: { x: 0, y: 0, w: 0.1, h: 1 },
              1: { x: 0.1, y: 0, w: 0.1, h: 1 },
              2: { x: 0.2, y: 0, w: 0.1, h: 1 },
              3: null,
              4: { x: 0.4, y: 0, w: 0.1, h: 1 },
              5: { x: 0.5, y: 0, w: 0.1, h: 1 },
              6: { x: 0.6, y: 0, w: 0.1, h: 1 },
              7: { x: 0.7, y: 0, w: 0.1, h: 1 },
              8: { x: 0.8, y: 0, w: 0.1, h: 1 },
            },
            confirmed: true,
          },
        ],
        syllableCuts: {},
      },
    ],
    ...overrides,
  };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('migrateHyphenation typographic → sung', () => {
  it('updates mode and words', () => {
    const p = makeProject();
    const { project } = migrateHyphenation(p, 'sung');
    expect(project.text.hyphenationMode).toBe('sung');
    // Sung splits: omnípotens = [om,ní,po,tens] (4 syls — R1 preserved count),
    //              bonae = [bo,nae] (2 — R11 reduces count),
    //              propter = [pro,pter] (2 — R10 preserved count)
    expect(project.text.words.map(w => w.syllables)).toEqual([
      ['om', 'ní', 'po', 'tens'],
      ['bo', 'nae'],
      ['pro', 'pter'],
    ]);
  });

  it('preserves boxes for words with same syllable count (remapped indices)', () => {
    const p = makeProject();
    const { project, stats } = migrateHyphenation(p, 'sung');
    const boxes = project.sources[0].lines[0].syllableBoxes!;

    // omnípotens: 4→4 syls, boxes 0-3 → 0-3 preserved
    expect(boxes[0]).toEqual({ x: 0, y: 0, w: 0.1, h: 1 });
    expect(boxes[1]).toEqual({ x: 0.1, y: 0, w: 0.1, h: 1 });
    expect(boxes[2]).toEqual({ x: 0.2, y: 0, w: 0.1, h: 1 });
    expect(boxes[3]).toBeNull();

    // propter: 2→2 syls, old indices 7-8 → new indices 6-7 (shifted because bonae lost 1 syl)
    expect(boxes[6]).toEqual({ x: 0.7, y: 0, w: 0.1, h: 1 });
    expect(boxes[7]).toEqual({ x: 0.8, y: 0, w: 0.1, h: 1 });

    // bonae: 3→2 syls, old indices 4,5,6 should be DROPPED (word's count changed)
    expect(boxes[4]).toBeUndefined();
    expect(boxes[5]).toBeUndefined();
    // stats
    expect(stats.preservedBoxes).toBe(5); // om, ní, pot, prop, ter → 5 (ens was null, not counted)
    expect(stats.droppedBoxes).toBe(3);   // bo, na, e all dropped
    expect(stats.changedWords).toHaveLength(1);
    expect(stats.changedWords[0].word).toBe('bonae');
    expect(stats.changedWords[0].oldSplit).toBe('bo-na-e');
    expect(stats.changedWords[0].newSplit).toBe('bo-nae');
  });

  it('remaps syllableRange to map to new indices', () => {
    const p = makeProject();
    const { project } = migrateHyphenation(p, 'sung');
    // Old range 0-8 covered all 9 syls. New has 8 syls (9-1 from bonae).
    expect(project.sources[0].lines[0].syllableRange).toEqual({ start: 0, end: 7 });
  });

  it('remaps gaps, dropping those in count-changed words', () => {
    const p = makeProject();
    // Add a gap in propter (idx 7, should remap to 6)
    p.sources[0].lines[0].gaps = [3, 7];
    const { project } = migrateHyphenation(p, 'sung');
    expect(project.sources[0].lines[0].gaps).toEqual([3, 6]);
  });

  it('does not mutate input project', () => {
    const p = makeProject();
    const originalWords = p.text.words.map(w => [...w.syllables]);
    const originalBoxes = { ...p.sources[0].lines[0].syllableBoxes };
    migrateHyphenation(p, 'sung');
    expect(p.text.words.map(w => w.syllables)).toEqual(originalWords);
    expect(p.sources[0].lines[0].syllableBoxes).toEqual(originalBoxes);
    expect(p.text.hyphenationMode).toBe('liturgical-typographic');
  });
});

describe('previewMigration', () => {
  it('returns stats without mutating or reassigning', () => {
    const p = makeProject();
    const stats = previewMigration(p, 'sung');
    expect(stats.oldSyllableCount).toBe(9);
    expect(stats.newSyllableCount).toBe(8);
    expect(stats.changedWords).toHaveLength(1);
    expect(stats.preservedBoxes).toBe(5);
    expect(stats.droppedBoxes).toBe(3);
    // Project unchanged
    expect(p.text.hyphenationMode).toBe('liturgical-typographic');
  });

  it('returns zero droppedBoxes when all words keep their syllable count', () => {
    const p = makeProject({
      text: {
        raw: 'propter',
        words: [{ original: 'propter', syllables: ['prop', 'ter'] }],
        hyphenationMode: 'liturgical-typographic',
      },
    });
    p.sources[0].lines[0].syllableRange = { start: 0, end: 1 };
    p.sources[0].lines[0].syllableBoxes = {
      0: { x: 0, y: 0, w: 0.5, h: 1 },
      1: { x: 0.5, y: 0, w: 0.5, h: 1 },
    };
    p.sources[0].lines[0].gaps = [];

    const stats = previewMigration(p, 'sung');
    expect(stats.droppedBoxes).toBe(0);
    expect(stats.preservedBoxes).toBe(2);
    expect(stats.changedWords).toHaveLength(0); // R10 preserves count
  });
});
