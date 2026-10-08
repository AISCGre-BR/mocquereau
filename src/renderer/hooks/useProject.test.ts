import { boxesInView } from "@shared/box-frame";
import { describe, it, expect } from "vitest";
import {
  projectReducer,
  initialStateForTest,
  createNewProject,
  createDocumentReducer,
  initialDocumentState,
  toProjectState,
  type DocumentState,
  type ProjectState,
} from "./useProject";
import { SUGGESTED_CLASSIFICATION, cloneClassification } from "@shared/classification";
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
      classes: [null, null, null],
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
      classification: SUGGESTED_CLASSIFICATION,
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
        classes: [null, null, null],
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
        classes: [null, null, null],
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

describe("projectReducer — box frame model (spec R1, S6/S7)", () => {
  const BOX = { x: 0, y: 0, w: 0.25, h: 0.5 };
  const img = { dataUrl: "data:,", width: 200, height: 100, mimeType: "image/png" };
  const R = (rotation: number, flipH = false, flipV = false) => ({ rotation, flipH, flipV });
  const ADJ = { brightness: 100, contrast: 100, saturation: 100, grayscale: 0, invert: false, flipH: false, flipV: false };
  const stateWithLine = (overrides: Partial<ManuscriptLine>) => {
    const source = { ...makeSource("S1", 1), lines: [mkLine("L1", { image: img, ...overrides })] };
    return makeStateWithSources([source]);
  };
  const adjust = (adjustments: Partial<ImageAdjustments>) => ({
    type: "UPDATE_LINE_ADJUSTMENTS" as const,
    payload: { sourceId: "S1", lineId: "L1", adjustments },
  });
  const lineOf = (s: { project: { sources: ManuscriptSource[] } | null }) => s.project!.sources[0].lines[0];

  it("rotating leaves the stored boxes untouched and pins the frame they were drawn in", () => {
    const state = stateWithLine({ syllableBoxes: { 0: BOX, 1: null } });
    const l = lineOf(projectReducer(state, adjust({ rotation: 90 })));
    expect(l.syllableBoxes).toBe(lineOf(state).syllableBoxes);
    expect(l.boxFrame).toEqual(R(0));
    expect(l.imageAdjustments?.rotation).toBe(90);
    // What the user sees is derived by the selector.
    const v = boxesInView(l);
    expect(v[1]).toBeNull();
    expect(v[0]!.x).toBeCloseTo(0.5, 9);
    expect(v[0]!.y).toBeCloseTo(0, 9);
    expect(v[0]!.w).toBeCloseTo(0.5, 9);
    expect(v[0]!.h).toBeCloseTo(0.25, 9);
  });

  it("an existing boxFrame is kept as is", () => {
    const state = stateWithLine({
      syllableBoxes: { 0: BOX },
      imageAdjustments: { ...ADJ, rotation: 90 },
      boxFrame: R(90),
    });
    const l = lineOf(projectReducer(state, adjust({ rotation: 0 })));
    expect(l.boxFrame).toEqual(R(90));
    expect(l.syllableBoxes![0]).toBe(BOX);
    expect(l.imageAdjustments).toBeUndefined();
  });

  it("colour-only changes keep the very same boxes object", () => {
    const state = stateWithLine({ syllableBoxes: { 0: BOX } });
    const next = projectReducer(state, adjust({ brightness: 150 }));
    expect(lineOf(next).syllableBoxes).toBe(lineOf(state).syllableBoxes);
  });

  it("lines without boxes get no boxFrame", () => {
    expect("boxFrame" in lineOf(projectReducer(stateWithLine({}), adjust({ rotation: 90 })))).toBe(false);
  });

  it("UPDATE_LINE_BOXES stores the editor's boxes in the current frame", () => {
    const state = stateWithLine({
      syllableBoxes: { 0: BOX, 1: BOX },
      imageAdjustments: { ...ADJ, rotation: 90 },
      boxFrame: R(0),
    });
    // The editor works on boxesInView (current frame) and sends back the whole map.
    const view = boxesInView(lineOf(state));
    const edited = { ...view, 2: { x: 0.1, y: 0.1, w: 0.1, h: 0.1 } };
    const next = projectReducer(state, {
      type: "UPDATE_LINE_BOXES",
      payload: { sourceId: "S1", lineId: "L1", syllableBoxes: edited, confirmed: true },
    });
    const l = lineOf(next);
    expect(l.boxFrame).toEqual(R(90));
    expect(l.syllableBoxes).toBe(edited);
    expect(l.confirmed).toBe(true);
    expect(boxesInView(l)).toBe(edited);
    expect(next.isDirty).toBe(true);
  });

  it("UPDATE_LINE_BOXES can merge crops into the source (confirm)", () => {
    const state = stateWithLine({ syllableBoxes: {} });
    const cut = { dataUrl: "data:image/png;base64,AA==", width: 1, height: 1, mimeType: "image/png" };
    const next = projectReducer(state, {
      type: "UPDATE_LINE_BOXES",
      payload: {
        sourceId: "S1", lineId: "L1", syllableBoxes: { 0: BOX },
        syllableRange: { start: 0, end: 2 }, gaps: [1], confirmed: true, syllableCuts: { 0: cut },
      },
    });
    const src = next.project!.sources[0];
    expect(src.syllableCuts[0]).toBe(cut);
    expect(src.lines[0].syllableRange).toEqual({ start: 0, end: 2 });
    expect(src.lines[0].gaps).toEqual([1]);
    expect(src.lines[0].boxFrame).toEqual(R(0));
  });
});


describe("classification", () => {
  it("createNewProject starts from the given classification or the suggested one", () => {
    expect(createNewProject("T", "").classification).toEqual(SUGGESTED_CLASSIFICATION);
    const custom = cloneClassification(SUGGESTED_CLASSIFICATION);
    custom[0].name = "Notação";
    expect(createNewProject("T", "", custom).classification[0].name).toBe("Notação");
  });

  it("SET_CLASSIFICATION replaces the taxonomy and marks dirty", () => {
    const s0: ProjectState = { project: createNewProject("T", ""), isDirty: false, currentFilePath: null };
    const next = cloneClassification(SUGGESTED_CLASSIFICATION);
    next[2].values.push({ id: "v1", name: "Moçárabe" });
    const s1 = projectReducer(s0, { type: "SET_CLASSIFICATION", payload: next });
    expect(s1.project!.classification[2].values.at(-1)!.name).toBe("Moçárabe");
    expect(s1.isDirty).toBe(true);
  });
});

describe("projectReducer — line range and gaps (D6)", () => {
  const words: SyllabifiedWord[] = [
    { original: "Puer", syllables: ["Pu", "er"] },
    { original: "natus", syllables: ["na", "tus"] },
    { original: "est", syllables: ["est"] },
    { original: "nobis", syllables: ["no", "bis"] },
    { original: "et", syllables: ["et"] },
  ]; // 8 syllables
  const B = { x: 0.1, y: 0.1, w: 0.1, h: 0.1 };
  const state = () =>
    makeStateWithSources(
      [{ ...makeSource("S1", 1), lines: [mkLine("L1", { syllableRange: { start: 0, end: 7 }, gaps: [6], syllableBoxes: { 2: B, 7: B } })] }],
      words,
    );
  const line = (s: ProjectState) => s.project!.sources[0].lines[0];
  const setRange = (start: number, end: number) => ({
    type: "SET_LINE_RANGE" as const,
    payload: { sourceId: "S1", lineId: "L1", range: { start, end } },
  });

  it("SET_LINE_RANGE normalizes and keeps out-of-range boxes", () => {
    const next = projectReducer(state(), setRange(5, 2));
    expect(line(next).syllableRange).toEqual({ start: 2, end: 5 });
    expect(line(next).syllableBoxes![7]).toEqual(B);
    expect(line(next).gaps).toEqual([6]);
    expect(next.isDirty).toBe(true);
  });

  it("SET_LINE_RANGE clamps to the text's syllables", () => {
    const narrowed = projectReducer(state(), setRange(2, 3));
    expect(line(projectReducer(narrowed, setRange(-3, 40))).syllableRange).toEqual({ start: 0, end: 7 });
  });

  it("SET_LINE_RANGE with the current range is a no-op", () => {
    const s = state();
    expect(projectReducer(s, setRange(0, 7))).toBe(s);
  });

  it("SET_LINE_GAPS stores sorted unique gaps", () => {
    const next = projectReducer(state(), {
      type: "SET_LINE_GAPS",
      payload: { sourceId: "S1", lineId: "L1", gaps: [5, 1, 5] },
    });
    expect(line(next).gaps).toEqual([1, 5]);
  });

  it("consecutive SET_LINE_RANGE on the same line coalesce into one undo step", () => {
    let clock = 0;
    const reduce = createDocumentReducer(() => clock);
    let doc: DocumentState = reduce(initialDocumentState, { type: "SET_PROJECT", payload: state().project! });
    doc = reduce(doc, setRange(0, 6));
    clock += 200;
    doc = reduce(doc, setRange(0, 5));
    clock += 200;
    doc = reduce(doc, setRange(0, 4));
    expect(doc.history.past).toHaveLength(1);
    expect(line(toProjectState(doc)).syllableRange).toEqual({ start: 0, end: 4 });
    doc = reduce(doc, { type: "UNDO" });
    expect(line(toProjectState(doc)).syllableRange).toEqual({ start: 0, end: 7 });
  });

  it("arrow nudges coalesce through the UPDATE_LINE_BOXES nudge key", () => {
    let clock = 0;
    const reduce = createDocumentReducer(() => clock);
    let doc: DocumentState = reduce(initialDocumentState, { type: "SET_PROJECT", payload: state().project! });
    for (const x of [0.11, 0.12, 0.13]) {
      clock += 100;
      doc = reduce(doc, {
        type: "UPDATE_LINE_BOXES",
        payload: { sourceId: "S1", lineId: "L1", syllableBoxes: { 2: { ...B, x }, 7: B } },
        meta: { coalesceKey: "UPDATE_LINE_BOXES:L1:2:nudge" },
      });
    }
    expect(doc.history.past).toHaveLength(1);
    expect(doc.history.past[0].focus).toEqual({ sourceId: "S1", lineId: "L1" });
  });
});
