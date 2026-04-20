import { describe, it, expect } from "vitest";
import { projectReducer, initialStateForTest } from "./useProject";
import type { ManuscriptSource } from "../lib/models";

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
function makeStateWithSources(sources: ManuscriptSource[]) {
  return {
    project: {
      meta: { title: "Test", author: "Author", createdAt: "2026-01-01", updatedAt: "2026-01-01" },
      text: { raw: "", words: [], hyphenationMode: "sung" as const },
      sections: [],
      sources,
    },
    isDirty: false,
    currentFilePath: null,
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
