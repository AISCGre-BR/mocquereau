// src/renderer/lib/docx-collect.test.ts

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SUGGESTED_CLASSIFICATION } from '@shared/classification';
import type { MocquereauProject, StoredImage, SyllableBox } from './models';

// ── DOM mocks ────────────────────────────────────────────────────────────────
// collectDocxCrops relies on browser APIs (canvas, Image, atob) which are not
// available in the Node/Vitest environment. We mock them globally here.

// Mock atob: converts base64 → binary string (Node has Buffer for this)
vi.stubGlobal('atob', (b64: string) => Buffer.from(b64, 'base64').toString('binary'));

// Mock Image constructor
class MockImage {
  onload: (() => void) | null = null;
  onerror: ((e: unknown) => void) | null = null;
  _src: string = '';

  get src() { return this._src; }
  set src(value: string) {
    this._src = value;
    // Simulate async load completing on next microtask
    Promise.resolve().then(() => { if (this.onload) this.onload(); });
  }
}
vi.stubGlobal('Image', MockImage);

// Mock canvas element. Each createElement('canvas') call gets a FRESH ctx so
// tests can inspect filter/transform calls per crop.
function makeMockCtx() {
  return {
    drawImage: vi.fn(),
    translate: vi.fn(),
    rotate: vi.fn(),
    scale: vi.fn(),
    filter: 'none' as string,
  };
}
const capturedCtxs: ReturnType<typeof makeMockCtx>[] = [];
vi.stubGlobal('document', {
  createElement: vi.fn((_tag: string) => {
    const ctx = makeMockCtx();
    capturedCtxs.push(ctx);
    return {
      width: 0,
      height: 0,
      getContext: vi.fn(() => ctx),
      toDataURL: vi.fn(() => 'data:image/png;base64,iVBORw0KGgo='),
    };
  }),
});

// ── Helpers ──────────────────────────────────────────────────────────────────

function makeImage(overrides: Partial<StoredImage> = {}): StoredImage {
  return {
    dataUrl: 'data:image/png;base64,iVBORw0KGgo=',
    width: 100,
    height: 50,
    mimeType: 'image/png',
    ...overrides,
  };
}

function makeBox(overrides: Partial<SyllableBox> = {}): SyllableBox {
  return { x: 0, y: 0, w: 0.5, h: 1.0, ...overrides };
}

function makeProject(overrides: Partial<MocquereauProject> = {}): MocquereauProject {
  return {
    meta: { title: 'Test Piece', author: 'Researcher', createdAt: '', updatedAt: '' },
    text: {
      raw: 'Sanc-tus Do-mi-nus',
      words: [
        { original: 'Sanctus', syllables: ['Sanc', 'tus'] },
        { original: 'Dominus', syllables: ['Do', 'mi', 'nus'] },
      ],
      hyphenationMode: 'sung',
    },
    sections: [],
    classification: SUGGESTED_CLASSIFICATION,
    sources: [],
    ...overrides,
  };
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe('collectDocxCrops', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    capturedCtxs.length = 0;
    // Fresh ctx per canvas via makeMockCtx() in createElement stub;
    // toDataURL returns a valid base64 PNG stub inline per canvas (see stubGlobal above).
  });

  it('returns correct syllables array from project.text.words', async () => {
    const { collectDocxCrops } = await import('./docx-collect');
    const project = makeProject({ sources: [] });
    const payload = await collectDocxCrops(project);

    expect(payload.syllables).toEqual(['Sanc', 'tus', 'Do', 'mi', 'nus']);
  });

  it('returns correct meta fields from project', async () => {
    const { collectDocxCrops } = await import('./docx-collect');
    const project = makeProject({ sources: [] });
    const payload = await collectDocxCrops(project);

    expect(payload.title).toBe('Test Piece');
    expect(payload.author).toBe('Researcher');
    expect(payload.rawText).toBe('Sanc-tus Do-mi-nus');
  });

  it('wordBoundaries has length equal to syllables count', async () => {
    const { collectDocxCrops } = await import('./docx-collect');
    const project = makeProject({ sources: [] });
    const payload = await collectDocxCrops(project);

    expect(payload.wordBoundaries).toHaveLength(5);
  });

  it('wordBoundaries marks last syllable of each word as true', async () => {
    const { collectDocxCrops } = await import('./docx-collect');
    const project = makeProject({ sources: [] });
    const payload = await collectDocxCrops(project);

    // 'Sanc'=0, 'tus'=1(boundary), 'Do'=2, 'mi'=3, 'nus'=4(boundary)
    expect(payload.wordBoundaries[0]).toBe(false);
    expect(payload.wordBoundaries[1]).toBe(true);
    expect(payload.wordBoundaries[2]).toBe(false);
    expect(payload.wordBoundaries[3]).toBe(false);
    expect(payload.wordBoundaries[4]).toBe(true);
  });

  it('produces one row per source', async () => {
    const { collectDocxCrops } = await import('./docx-collect');
    const project = makeProject({
      sources: [
        {
          id: 's1',
          order: 0,
          metadata: { siglum: 'A', library: 'Lib', city: 'Paris', century: 'XII', classes: [null, null, null] },
          lines: [],
          syllableCuts: {},
        },
        {
          id: 's2',
          order: 1,
          metadata: { siglum: 'B', library: 'Lib', city: 'Lyon', century: 'XIII', classes: [null, null, null] },
          lines: [],
          syllableCuts: {},
        },
      ],
    });
    const payload = await collectDocxCrops(project);

    expect(payload.rows).toHaveLength(2);
  });

  it('row.cells has length equal to syllables count', async () => {
    const { collectDocxCrops } = await import('./docx-collect');
    const project = makeProject({
      sources: [
        {
          id: 's1',
          order: 0,
          metadata: { siglum: 'A', library: 'Lib', city: 'Paris', century: 'XII', classes: [null, null, null] },
          lines: [],
          syllableCuts: {},
        },
      ],
    });
    const payload = await collectDocxCrops(project);

    expect(payload.rows[0].cells).toHaveLength(5); // 5 syllables total
  });

  it('unfilled cells produce pngBuffer=null, isGap=false', async () => {
    const { collectDocxCrops } = await import('./docx-collect');
    const project = makeProject({
      sources: [
        {
          id: 's1',
          order: 0,
          metadata: { siglum: 'A', library: 'Lib', city: 'Paris', century: 'XII', classes: [null, null, null] },
          lines: [],
          syllableCuts: {},
        },
      ],
    });
    const payload = await collectDocxCrops(project);

    const cell = payload.rows[0].cells[0];
    expect(cell.pngBuffer).toBeNull();
    expect(cell.isGap).toBe(false);
  });

  it('explicit gap (null syllableBoxes entry) produces isGap=true, pngBuffer=null', async () => {
    const { collectDocxCrops } = await import('./docx-collect');
    const project = makeProject({
      sources: [
        {
          id: 's1',
          order: 0,
          metadata: { siglum: 'A', library: 'Lib', city: 'Paris', century: 'XII', classes: [null, null, null] },
          lines: [
            {
              id: 'l1',
              image: makeImage(),
              syllableRange: { start: 0, end: 4 },
              dividers: [],
              gaps: [],
              syllableBoxes: {
                0: makeBox(),   // filled
                1: null,        // explicit gap
                2: makeBox(),   // filled
                3: makeBox(),   // filled
                4: makeBox(),   // filled
              },
              confirmed: true,
            },
          ],
          syllableCuts: {},
        },
      ],
    });
    const payload = await collectDocxCrops(project);

    const gapCell = payload.rows[0].cells[1];
    expect(gapCell.isGap).toBe(true);
    expect(gapCell.pngBuffer).toBeNull();
  });

  it('filled cells produce non-null pngBuffer and correct dimensions', async () => {
    const { collectDocxCrops } = await import('./docx-collect');
    const project = makeProject({
      sources: [
        {
          id: 's1',
          order: 0,
          metadata: { siglum: 'A', library: 'Lib', city: 'Paris', century: 'XII', classes: [null, null, null] },
          lines: [
            {
              id: 'l1',
              image: makeImage({ width: 200, height: 100 }),
              syllableRange: { start: 0, end: 0 },
              dividers: [],
              gaps: [],
              syllableBoxes: {
                0: { x: 0, y: 0, w: 0.5, h: 1.0 }, // 100x100px crop
              },
              confirmed: true,
            },
          ],
          syllableCuts: {},
        },
      ],
    });
    const payload = await collectDocxCrops(project);

    const filledCell = payload.rows[0].cells[0];
    expect(filledCell.pngBuffer).not.toBeNull();
    expect(filledCell.cropWidth).toBe(100);   // 0.5 * 200
    expect(filledCell.cropHeight).toBe(100);  // 1.0 * 100
    expect(filledCell.isGap).toBe(false);
  });

  it('row.meta contains correct siglum, city, century, folio', async () => {
    const { collectDocxCrops } = await import('./docx-collect');
    const project = makeProject({
      sources: [
        {
          id: 's1',
          order: 0,
          metadata: { siglum: 'Ln', library: 'BnF', city: 'Paris', century: 'XII', classes: [null, null, null] },
          lines: [{
            id: 'l1',
            image: { dataUrl: 'data:,', width: 1, height: 1, mimeType: 'image/png' },
            syllableRange: { start: 0, end: 0 },
            dividers: [],
            gaps: [],
            confirmed: false,
            folio: ' 45r ',
          }],
          syllableCuts: {},
        },
      ],
    });
    const payload = await collectDocxCrops(project);

    expect(payload.rows[0].meta).toEqual({
      siglum: 'Ln',
      city: 'Paris',
      century: 'XII',
      folio: '45r',
      folios: [' 45r '], // per-page folios; folio is the first page's, trimmed
    });
  });

  it('onProgress callback is called with correct totals', async () => {
    const { collectDocxCrops } = await import('./docx-collect');
    const onProgress = vi.fn();
    const project = makeProject({
      sources: [
        {
          id: 's1',
          order: 0,
          metadata: { siglum: 'A', library: 'Lib', city: 'Paris', century: 'XII', classes: [null, null, null] },
          lines: [],
          syllableCuts: {},
        },
      ],
    });
    await collectDocxCrops(project, onProgress);

    // 1 source × 5 syllables = 5 calls
    expect(onProgress).toHaveBeenCalledTimes(5);
    // Last call should be (5, 5)
    expect(onProgress).toHaveBeenLastCalledWith(5, 5);
  });

  it('syllableCuts fallback is used when no lines have syllableBoxes', async () => {
    const { collectDocxCrops } = await import('./docx-collect');
    const project = makeProject({
      sources: [
        {
          id: 's1',
          order: 0,
          metadata: { siglum: 'A', library: 'Lib', city: 'Paris', century: 'XII', classes: [null, null, null] },
          lines: [], // no lines
          syllableCuts: {
            0: makeImage(), // Phase 4/5 fallback: pre-computed cut at idx 0
            1: null,        // gap
          },
        },
      ],
    });
    const payload = await collectDocxCrops(project);

    // idx 0: has syllableCuts entry with image
    expect(payload.rows[0].cells[0].pngBuffer).not.toBeNull();
    expect(payload.rows[0].cells[0].isGap).toBe(false);

    // idx 1: has syllableCuts null = gap
    expect(payload.rows[0].cells[1].pngBuffer).toBeNull();
    expect(payload.rows[0].cells[1].isGap).toBe(true);

    // idx 2-4: no entry = unfilled
    expect(payload.rows[0].cells[2].pngBuffer).toBeNull();
    expect(payload.rows[0].cells[2].isGap).toBe(false);
  });

  it('bakes imageAdjustments into canvas crop: filter + geometry (Phase 10 / IMG-06 E2E fix)', async () => {
    const { collectDocxCrops } = await import('./docx-collect');
    const project = makeProject({ sources: [
      {
        id: 's1',
        order: 0,
        metadata: { siglum: 'A', library: 'Lib', city: 'Paris', century: 'XII', classes: [null, null, null] },
        lines: [{
          id: 'l1',
          image: makeImage(),
          syllableRange: { start: 0, end: 0 },
          dividers: [],
          gaps: [],
          confirmed: true,
          syllableBoxes: { 0: makeBox() },
          imageAdjustments: {
            brightness: 150,
            contrast: 120,
            saturation: 100,
            grayscale: 0,
            invert: true,
            rotation: 90,
            flipH: true,
            flipV: false,
          },
        }],
        syllableCuts: {},
      },
    ]});
    await collectDocxCrops(project);

    // One canvas created per cropped syllable — for this setup, exactly 1 crop
    const cropCtx = capturedCtxs.find((c) => c.drawImage.mock.calls.length > 0);
    expect(cropCtx).toBeDefined();

    // Color filter must be applied before drawImage. Since we set it via
    // `ctx.filter = filterStr`, the string must contain brightness and invert.
    expect(cropCtx!.filter).toContain('brightness(150%)');
    expect(cropCtx!.filter).toContain('invert(1)');
    expect(cropCtx!.filter).toContain('contrast(120%)');

    // Geometric transforms were called (rotation 90° + flipH)
    expect(cropCtx!.translate).toHaveBeenCalledTimes(1);
    expect(cropCtx!.rotate).toHaveBeenCalledWith(Math.PI / 2);
    expect(cropCtx!.scale).toHaveBeenCalledWith(-1, 1);
  });

  it('does NOT apply filter/transform when imageAdjustments is undefined (v0.0.3 projects)', async () => {
    const { collectDocxCrops } = await import('./docx-collect');
    const project = makeProject({ sources: [
      {
        id: 's1',
        order: 0,
        metadata: { siglum: 'A', library: 'Lib', city: 'Paris', century: 'XII', classes: [null, null, null] },
        lines: [{
          id: 'l1',
          image: makeImage(),
          syllableRange: { start: 0, end: 0 },
          dividers: [],
          gaps: [],
          confirmed: true,
          syllableBoxes: { 0: makeBox() },
          // imageAdjustments deliberately absent — retrocompat v0.0.3
        }],
        syllableCuts: {},
      },
    ]});
    await collectDocxCrops(project);

    const cropCtx = capturedCtxs.find((c) => c.drawImage.mock.calls.length > 0);
    expect(cropCtx).toBeDefined();
    expect(cropCtx!.filter).toBe('none'); // default from makeMockCtx, never overwritten
    expect(cropCtx!.translate).not.toHaveBeenCalled();
    expect(cropCtx!.rotate).not.toHaveBeenCalled();
    expect(cropCtx!.scale).not.toHaveBeenCalled();
  });

  it('cell.isWordBoundary mirrors wordBoundaries array', async () => {
    const { collectDocxCrops } = await import('./docx-collect');
    const project = makeProject({ sources: [
      {
        id: 's1',
        order: 0,
        metadata: { siglum: 'A', library: 'Lib', city: 'Paris', century: 'XII', classes: [null, null, null] },
        lines: [],
        syllableCuts: {},
      },
    ]});
    const payload = await collectDocxCrops(project);

    for (let i = 0; i < payload.syllables.length; i++) {
      expect(payload.rows[0].cells[i].isWordBoundary).toBe(payload.wordBoundaries[i]);
    }
  });

  it('crops boxes stored in another frame through boxesInView (S6/S7)', async () => {
    const { collectDocxCrops } = await import('./docx-collect');
    // Boxes drawn at rotation 0 (left half of the 100x50 original), then the
    // image was rotated 90: the crop must cover the same ink, now the top half
    // of the 50x100 rotated view.
    const project = makeProject({ sources: [
      {
        id: 's1',
        order: 0,
        metadata: { siglum: 'A', library: 'Lib', city: 'Paris', century: 'XII', classes: [null, null, null] },
        lines: [{
          id: 'l1',
          image: makeImage(),
          syllableRange: { start: 0, end: 0 },
          dividers: [],
          gaps: [],
          confirmed: true,
          syllableBoxes: { 0: makeBox() },
          imageAdjustments: {
            brightness: 100, contrast: 100, saturation: 100, grayscale: 0, invert: false,
            rotation: 90, flipH: false, flipV: false,
          },
          boxFrame: { rotation: 0, flipH: false, flipV: false },
        }],
        syllableCuts: {},
      },
    ]});
    const payload = await collectDocxCrops(project);
    const crop = capturedCtxs.filter((c) => c.drawImage.mock.calls.length > 0).pop()!;
    const [, sx, sy, sw, sh] = crop.drawImage.mock.calls[0];
    expect([sx, sy, sw, sh]).toEqual([0, 0, 50, 50]);
    expect(payload.rows[0].cells[0].cropWidth).toBe(50);
    expect(payload.rows[0].cells[0].cropHeight).toBe(50);
  });
});
