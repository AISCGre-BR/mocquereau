import { describe, it, expect } from "vitest";
import { projectReducer, initialStateForTest } from "./useProject";
import type { ManuscriptSource, ManuscriptLine, StoredImage, SyllabifiedWord } from "../lib/models";

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
