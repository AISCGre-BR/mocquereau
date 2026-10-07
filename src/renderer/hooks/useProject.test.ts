import { describe, it, expect } from "vitest";
import { projectReducer, initialStateForTest } from "./useProject";
import type { ManuscriptSource, ManuscriptLine, StoredImage, SyllabifiedWord, ImageAdjustments } from "../lib/models";

// Helper to create a minimal ManuscriptSource for testing
function makeSource(id: string, order: number): ManuscriptSource {
  return {
    id,
    order,
    metadata: {
      siglum: `S${id}`,
      library: "Test Library",
      city: "Test City",
      century: "XII",
      folio: "1r",
      notation: "adiastematic",
    },
    lines: [],
    syllableCuts: {},
  };
}

// Helper to create a project state with sources
function makeStateWithSources(sources: ManuscriptSource[], words: SyllabifiedWord[] = []) {
  return {
    project: {
      meta: { title: "Test", author: "Author", createdAt: "2026-01-01", updatedAt: "2026-01-01" },
      text: { raw: "", words, hyphenationMode: "sung" as const },
      sections: [],
      sources,
    },
    isDirty: false,
    currentFilePath: null,
  };
}

function mkImage(): StoredImage {
  return { dataUrl: "data:,", width: 1, height: 1, mimeType: "image/png" };
}

function mkLine(id: string, overrides: Partial<ManuscriptLine> = {}): ManuscriptLine {
  return {
    id,
    image: mkImage(),
    syllableRange: { start: 0, end: 0 },
    dividers: [],
    gaps: [],
    confirmed: false,
    ...overrides,
  };
}

describe("projectReducer — source actions", () => {
  describe("ADD_SOURCE", () => {
    it("appends source and sets order = sources.length + 1", () => {
      const state = makeStateWithSources([makeSource("a", 1)]);
      const newSource = makeSource("b", 99); // order will be overridden
      const next = projectReducer(state, { type: "ADD_SOURCE", payload: newSource });
      expect(next.project!.sources).toHaveLength(2);
      expect(next.project!.sources[1].id).toBe("b");
      expect(next.project!.sources[1].order).toBe(2);
      expect(next.isDirty).toBe(true);
    });

    it("guards against null project", () => {
      const state = { project: null, isDirty: false, currentFilePath: null };
      const next = projectReducer(state, { type: "ADD_SOURCE", payload: makeSource("a", 1) });
      expect(next).toBe(state);
    });
  });

  describe("REMOVE_SOURCE", () => {
    it("removes source by id and re-assigns order", () => {
      const state = makeStateWithSources([
        makeSource("a", 1),
        makeSource("b", 2),
        makeSource("c", 3),
      ]);
      const next = projectReducer(state, { type: "REMOVE_SOURCE", payload: "b" });
      expect(next.project!.sources).toHaveLength(2);
      expect(next.project!.sources.map((s) => s.id)).toEqual(["a", "c"]);
      expect(next.project!.sources.map((s) => s.order)).toEqual([1, 2]);
      expect(next.isDirty).toBe(true);
    });

    it("guards against null project", () => {
      const state = { project: null, isDirty: false, currentFilePath: null };
      const next = projectReducer(state, { type: "REMOVE_SOURCE", payload: "a" });
      expect(next).toBe(state);
    });
  });

  describe("UPDATE_SOURCE", () => {
    it("replaces matching source by id", () => {
      const state = makeStateWithSources([makeSource("a", 1), makeSource("b", 2)]);
      const updated = { ...makeSource("b", 2), metadata: { ...makeSource("b", 2).metadata, siglum: "NEW" } };
      const next = projectReducer(state, { type: "UPDATE_SOURCE", payload: updated });
      expect(next.project!.sources[1].metadata.siglum).toBe("NEW");
      expect(next.project!.sources[0].id).toBe("a");
      expect(next.isDirty).toBe(true);
    });

    it("guards against null project", () => {
      const state = { project: null, isDirty: false, currentFilePath: null };
      const next = projectReducer(state, { type: "UPDATE_SOURCE", payload: makeSource("a", 1) });
      expect(next).toBe(state);
    });
  });

  describe("DUPLICATE_SOURCE", () => {
    it("creates a copy with new id, order = length + 1, empty lines and syllableCuts", () => {
      const original = { ...makeSource("a", 1), lines: [], syllableCuts: {} };
      const state = makeStateWithSources([original]);
      const next = projectReducer(state, { type: "DUPLICATE_SOURCE", payload: "a" });
      expect(next.project!.sources).toHaveLength(2);
      const copy = next.project!.sources[1];
      expect(copy.id).not.toBe("a");
      expect(copy.order).toBe(2);
      expect(copy.lines).toEqual([]);
      expect(copy.syllableCuts).toEqual({});
      expect(copy.metadata.siglum).toBe(original.metadata.siglum);
      expect(next.isDirty).toBe(true);
    });

    it("returns state unchanged if id not found", () => {
      const state = makeStateWithSources([makeSource("a", 1)]);
      const next = projectReducer(state, { type: "DUPLICATE_SOURCE", payload: "nonexistent" });
      expect(next).toBe(state);
    });

    it("guards against null project", () => {
      const state = { project: null, isDirty: false, currentFilePath: null };
      const next = projectReducer(state, { type: "DUPLICATE_SOURCE", payload: "a" });
      expect(next).toBe(state);
    });
  });

  describe("REORDER_SOURCE", () => {
    it("moves source up (swaps with previous)", () => {
      const state = makeStateWithSources([makeSource("a", 1), makeSource("b", 2), makeSource("c", 3)]);
      const next = projectReducer(state, { type: "REORDER_SOURCE", payload: { id: "b", direction: "up" } });
      expect(next.project!.sources.map((s) => s.id)).toEqual(["b", "a", "c"]);
      expect(next.project!.sources.map((s) => s.order)).toEqual([1, 2, 3]);
      expect(next.isDirty).toBe(true);
    });

    it("moves source down (swaps with next)", () => {
      const state = makeStateWithSources([makeSource("a", 1), makeSource("b", 2), makeSource("c", 3)]);
      const next = projectReducer(state, { type: "REORDER_SOURCE", payload: { id: "b", direction: "down" } });
      expect(next.project!.sources.map((s) => s.id)).toEqual(["a", "c", "b"]);
      expect(next.project!.sources.map((s) => s.order)).toEqual([1, 2, 3]);
      expect(next.isDirty).toBe(true);
    });

    it("returns state unchanged when moving first item up", () => {
      const state = makeStateWithSources([makeSource("a", 1), makeSource("b", 2)]);
      const next = projectReducer(state, { type: "REORDER_SOURCE", payload: { id: "a", direction: "up" } });
      expect(next).toBe(state);
    });

    it("returns state unchanged when moving last item down", () => {
      const state = makeStateWithSources([makeSource("a", 1), makeSource("b", 2)]);
      const next = projectReducer(state, { type: "REORDER_SOURCE", payload: { id: "b", direction: "down" } });
      expect(next).toBe(state);
    });

    it("returns state unchanged if id not found", () => {
      const state = makeStateWithSources([makeSource("a", 1)]);
      const next = projectReducer(state, { type: "REORDER_SOURCE", payload: { id: "nonexistent", direction: "up" } });
      expect(next).toBe(state);
    });

    it("guards against null project", () => {
      const state = { project: null, isDirty: false, currentFilePath: null };
      const next = projectReducer(state, { type: "REORDER_SOURCE", payload: { id: "a", direction: "up" } });
      expect(next).toBe(state);
    });
  });
});

describe("projectReducer — UPDATE_SYLLABLE_TEXT", () => {
  const makeWordsState = () =>
    makeStateWithSources(
      [],
      [
        { original: "regnabit", syllables: ["re", "gna", "bit"] },
        { original: "dominus", syllables: ["do", "mi", "nus"] },
      ],
    );

  it("updates a single syllable without changing count", () => {
    const state = makeWordsState();
    const next = projectReducer(state, {
      type: "UPDATE_SYLLABLE_TEXT",
      payload: { wordIdx: 0, sylIdx: 0, newText: "reg" },
    });
    expect(next.project!.text.words[0].syllables).toEqual(["reg", "gna", "bit"]);
    expect(next.project!.text.words[0].syllables.length).toBe(3);
    // other word untouched
    expect(next.project!.text.words[1].syllables).toEqual(["do", "mi", "nus"]);
    expect(next.isDirty).toBe(true);
  });

  it("guards against null project", () => {
    const state = { project: null, isDirty: false, currentFilePath: null };
    const next = projectReducer(state, {
      type: "UPDATE_SYLLABLE_TEXT",
      payload: { wordIdx: 0, sylIdx: 0, newText: "x" },
    });
    expect(next).toBe(state);
  });

  it("returns state unchanged on wordIdx out of range", () => {
    const state = makeWordsState();
    const next = projectReducer(state, {
      type: "UPDATE_SYLLABLE_TEXT",
      payload: { wordIdx: 99, sylIdx: 0, newText: "x" },
    });
    expect(next).toBe(state);
  });

  it("returns state unchanged on sylIdx out of range", () => {
    const state = makeWordsState();
    const next = projectReducer(state, {
      type: "UPDATE_SYLLABLE_TEXT",
      payload: { wordIdx: 0, sylIdx: 99, newText: "x" },
    });
    expect(next).toBe(state);
  });
});

describe("projectReducer — UPDATE_LINE_METADATA", () => {
  const sourceId = "S1";
  const lineId = "L1";

  const makeLinesState = () => {
    const source: ManuscriptSource = {
      id: sourceId,
      order: 1,
      metadata: {
        siglum: "X",
        library: "",
        city: "",
        century: "",
        folio: "",
        notation: "square",
      },
      lines: [mkLine(lineId)],
      syllableCuts: {},
    };
    return makeStateWithSources([source]);
  };

  it("sets folio and label on the target line", () => {
    const state = makeLinesState();
    const next = projectReducer(state, {
      type: "UPDATE_LINE_METADATA",
      payload: { sourceId, lineId, folio: "12r", label: "início" },
    });
    const line = next.project!.sources[0].lines[0];
    expect(line.folio).toBe("12r");
    expect(line.label).toBe("início");
    // other core fields preserved
    expect(line.id).toBe(lineId);
    expect(line.image).toBeDefined();
    expect(line.syllableRange).toEqual({ start: 0, end: 0 });
    expect(line.dividers).toEqual([]);
    expect(line.gaps).toEqual([]);
    expect(line.confirmed).toBe(false);
    expect(next.isDirty).toBe(true);
  });

  it("accepts clearing folio to undefined while keeping label", () => {
    const state = makeLinesState();
    const next = projectReducer(state, {
      type: "UPDATE_LINE_METADATA",
      payload: { sourceId, lineId, folio: undefined, label: "x" },
    });
    const line = next.project!.sources[0].lines[0];
    expect(line.folio).toBeUndefined();
    expect(line.label).toBe("x");
  });

  it("returns state unchanged when sourceId not found", () => {
    const state = makeLinesState();
    const next = projectReducer(state, {
      type: "UPDATE_LINE_METADATA",
      payload: { sourceId: "nope", lineId, folio: "12r" },
    });
    // the sources array is mapped but content equal; verify no source was changed
    expect(next.project!.sources[0].lines[0].folio).toBeUndefined();
    expect(next.project!.sources[0].lines[0].label).toBeUndefined();
  });

  it("returns unchanged line when lineId not found", () => {
    const state = makeLinesState();
    const next = projectReducer(state, {
      type: "UPDATE_LINE_METADATA",
      payload: { sourceId, lineId: "nope", folio: "12r" },
    });
    expect(next.project!.sources[0].lines[0].folio).toBeUndefined();
  });

  it("guards against null project", () => {
    const state = { project: null, isDirty: false, currentFilePath: null };
    const next = projectReducer(state, {
      type: "UPDATE_LINE_METADATA",
      payload: { sourceId, lineId, folio: "12r" },
    });
    expect(next).toBe(state);
  });
});

describe("projectReducer — UPDATE_LINE_ADJUSTMENTS", () => {
  const sourceId = "S1";
  const lineId = "L1";

  const ADJ_ALL_DEFAULT: ImageAdjustments = {
    brightness: 100,
    contrast: 100,
    saturation: 100,
    grayscale: 0,
    invert: false,
    rotation: 0,
    flipH: false,
    flipV: false,
  };

  const makeLinesState = (lineOverrides: Partial<ManuscriptLine> = {}) => {
    const source: ManuscriptSource = {
      id: sourceId,
      order: 1,
      metadata: {
        siglum: "X",
        library: "",
        city: "",
        century: "",
        folio: "",
        notation: "square",
      },
      lines: [mkLine(lineId, lineOverrides)],
      syllableCuts: {},
    };
    return makeStateWithSources([source]);
  };

  it("Test 1: creates imageAdjustments with all 8 fields (defaults merged) when partial update hits line without adjustments", () => {
    const state = makeLinesState();
    const next = projectReducer(state, {
      type: "UPDATE_LINE_ADJUSTMENTS",
      payload: { sourceId, lineId, adjustments: { brightness: 150 } },
    });
    const adj = next.project!.sources[0].lines[0].imageAdjustments;
    expect(adj).toBeDefined();
    expect(adj).toEqual({
      brightness: 150,
      contrast: 100,
      saturation: 100,
      grayscale: 0,
      invert: false,
      rotation: 0,
      flipH: false,
      flipV: false,
    });
    expect(next.isDirty).toBe(true);
  });

  it("Test 2: removes imageAdjustments field (delete) when merge results in all-default values", () => {
    const state = makeLinesState({
      imageAdjustments: { ...ADJ_ALL_DEFAULT, brightness: 150 },
    });
    const next = projectReducer(state, {
      type: "UPDATE_LINE_ADJUSTMENTS",
      payload: { sourceId, lineId, adjustments: { brightness: 100 } },
    });
    const line = next.project!.sources[0].lines[0];
    expect("imageAdjustments" in line).toBe(false);
    expect(line.imageAdjustments).toBeUndefined();
    expect(next.isDirty).toBe(true);
  });

  it("Test 3: partial update merges with existing adjustments (preserves other values)", () => {
    const existing: ImageAdjustments = { ...ADJ_ALL_DEFAULT, brightness: 150 };
    const state = makeLinesState({ imageAdjustments: existing });
    const next = projectReducer(state, {
      type: "UPDATE_LINE_ADJUSTMENTS",
      payload: { sourceId, lineId, adjustments: { contrast: 120 } },
    });
    const adj = next.project!.sources[0].lines[0].imageAdjustments;
    expect(adj).toEqual({
      brightness: 150,
      contrast: 120,
      saturation: 100,
      grayscale: 0,
      invert: false,
      rotation: 0,
      flipH: false,
      flipV: false,
    });
  });

  it("Test 4: rotation 90 + update to 270 substitutes directly (no accumulation)", () => {
    const existing: ImageAdjustments = { ...ADJ_ALL_DEFAULT, rotation: 90 };
    const state = makeLinesState({ imageAdjustments: existing });
    const next = projectReducer(state, {
      type: "UPDATE_LINE_ADJUSTMENTS",
      payload: { sourceId, lineId, adjustments: { rotation: 270 } },
    });
    expect(next.project!.sources[0].lines[0].imageAdjustments!.rotation).toBe(270);
  });

  it("Test 5: invalid sourceId returns state unchanged", () => {
    const state = makeLinesState();
    const next = projectReducer(state, {
      type: "UPDATE_LINE_ADJUSTMENTS",
      payload: { sourceId: "nope", lineId, adjustments: { brightness: 150 } },
    });
    expect(next).toBe(state);
    expect(next.isDirty).toBe(false);
  });

  it("Test 6: invalid lineId within valid source returns state unchanged", () => {
    const state = makeLinesState();
    const next = projectReducer(state, {
      type: "UPDATE_LINE_ADJUSTMENTS",
      payload: { sourceId, lineId: "nope", adjustments: { brightness: 150 } },
    });
    expect(next).toBe(state);
    expect(next.isDirty).toBe(false);
  });

  it("Test 7: valid dispatch marks isDirty=true", () => {
    const state = makeLinesState();
    const next = projectReducer(state, {
      type: "UPDATE_LINE_ADJUSTMENTS",
      payload: { sourceId, lineId, adjustments: { invert: true } },
    });
    expect(next.isDirty).toBe(true);
  });

  it("guards against null project", () => {
    const state = { project: null, isDirty: false, currentFilePath: null };
    const next = projectReducer(state, {
      type: "UPDATE_LINE_ADJUSTMENTS",
      payload: { sourceId, lineId, adjustments: { brightness: 150 } },
    });
    expect(next).toBe(state);
  });
});

// ── Wave A2 additions ────────────────────────────────────────────────────────

function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object") {
    Object.freeze(value);
    for (const v of Object.values(value as object)) deepFreeze(v);
  }
  return value;
}

describe("projectReducer — REORDER_SOURCE immutability", () => {
  it("does not mutate source objects shared with the previous state", () => {
    const state = deepFreeze(makeStateWithSources([makeSource("a", 1), makeSource("b", 2), makeSource("c", 3)]));
    const next = projectReducer(state, { type: "REORDER_SOURCE", payload: { id: "b", direction: "up" } });
    expect(next.project!.sources.map((s) => [s.id, s.order])).toEqual([["b", 1], ["a", 2], ["c", 3]]);
    expect(state.project!.sources.map((s) => [s.id, s.order])).toEqual([["a", 1], ["b", 2], ["c", 3]]);
    expect(next.project!.sources[2]).toBe(state.project!.sources[2]);
  });
});

describe("projectReducer — REPLACE_PROJECT / LOAD_PROJECT", () => {
  it("REPLACE_PROJECT swaps the project and marks it dirty", () => {
    const state = makeStateWithSources([makeSource("a", 1)]);
    const replacement = { ...state.project!, meta: { ...state.project!.meta, title: "New" } };
    const next = projectReducer(state, { type: "REPLACE_PROJECT", payload: replacement });
    expect(next.project).toBe(replacement);
    expect(next.isDirty).toBe(true);
  });

  it("LOAD_PROJECT is clean unless dirty is requested", () => {
    const state = makeStateWithSources([]);
    const p = state.project!;
    expect(projectReducer(state, { type: "LOAD_PROJECT", payload: { project: p } }).isDirty).toBe(false);
    expect(projectReducer(state, { type: "LOAD_PROJECT", payload: { project: p, dirty: true } }).isDirty).toBe(true);
    expect(projectReducer(state, { type: "LOAD_PROJECT", payload: { project: null } }).project).toBeNull();
  });
});

describe("projectReducer — R2 box remap on rotation/flip", () => {
  const BOX = { x: 0, y: 0, w: 0.25, h: 0.5 };
  const img = { dataUrl: "data:,", width: 200, height: 100, mimeType: "image/png" };
  const stateWithLine = (overrides: Partial<ManuscriptLine>) => {
    const source = { ...makeSource("S1", 1), lines: [mkLine("L1", { image: img, ...overrides })] };
    return makeStateWithSources([source]);
  };
  const adjust = (adjustments: Partial<ImageAdjustments>) => ({
    type: "UPDATE_LINE_ADJUSTMENTS" as const,
    payload: { sourceId: "S1", lineId: "L1", adjustments },
  });
  const lineOf = (s: { project: { sources: ManuscriptSource[] } | null }) => s.project!.sources[0].lines[0];

  it("rotating 90 degrees remaps the boxes and records boxFrame", () => {
    const next = projectReducer(stateWithLine({ syllableBoxes: { 0: BOX, 1: null } }), adjust({ rotation: 90 }));
    const l = lineOf(next);
    expect(l.boxFrame).toEqual({ rotation: 90, flipH: false, flipV: false });
    expect(l.syllableBoxes![1]).toBeNull();
    expect(l.syllableBoxes![0]!.x).toBeCloseTo(0.5, 9);
    expect(l.syllableBoxes![0]!.y).toBeCloseTo(0, 9);
    expect(l.syllableBoxes![0]!.w).toBeCloseTo(0.5, 9);
    expect(l.syllableBoxes![0]!.h).toBeCloseTo(0.25, 9);
  });

  it("rotating back restores the original boxes", () => {
    const s1 = projectReducer(stateWithLine({ syllableBoxes: { 0: BOX } }), adjust({ rotation: 90 }));
    const s2 = projectReducer(s1, adjust({ rotation: 0 }));
    const b = lineOf(s2).syllableBoxes![0]!;
    expect(b.x).toBeCloseTo(BOX.x, 9);
    expect(b.w).toBeCloseTo(BOX.w, 9);
    expect(lineOf(s2).boxFrame).toEqual({ rotation: 0, flipH: false, flipV: false });
    expect(lineOf(s2).imageAdjustments).toBeUndefined();
  });

  it("colour-only changes keep the very same boxes object", () => {
    const state = stateWithLine({ syllableBoxes: { 0: BOX } });
    const next = projectReducer(state, adjust({ brightness: 150 }));
    expect(lineOf(next).syllableBoxes).toBe(lineOf(state).syllableBoxes);
    expect(lineOf(next).boxFrame).toBeUndefined();
  });

  it("lines without boxes get no boxFrame, and a stale one is dropped", () => {
    expect("boxFrame" in lineOf(projectReducer(stateWithLine({}), adjust({ rotation: 90 })))).toBe(false);
    const stale = stateWithLine({ syllableBoxes: { 0: null }, boxFrame: { rotation: 90, flipH: false, flipV: false } });
    expect("boxFrame" in lineOf(projectReducer(stale, adjust({ rotation: 180 })))).toBe(false);
  });

  it("uses an existing boxFrame as the source frame", () => {
    const state = stateWithLine({
      syllableBoxes: { 0: { x: 0.5, y: 0, w: 0.5, h: 0.25 } },
      imageAdjustments: { brightness: 100, contrast: 100, saturation: 100, grayscale: 0, invert: false, rotation: 90, flipH: false, flipV: false },
      boxFrame: { rotation: 90, flipH: false, flipV: false },
    });
    const b = lineOf(projectReducer(state, adjust({ rotation: 0 }))).syllableBoxes![0]!;
    expect(b.x).toBeCloseTo(0, 9);
    expect(b.h).toBeCloseTo(0.5, 9);
  });

  it("keeps boxes and their frame when the image size is unusable", () => {
    const state = stateWithLine({ image: { ...img, width: 0 }, syllableBoxes: { 0: BOX } });
    const l = lineOf(projectReducer(state, adjust({ rotation: 90 })));
    expect(l.syllableBoxes![0]).toEqual(BOX);
    expect(l.boxFrame).toEqual({ rotation: 0, flipH: false, flipV: false });
  });
});
