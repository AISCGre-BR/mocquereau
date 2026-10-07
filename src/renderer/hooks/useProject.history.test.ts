import { describe, expect, it } from "vitest";
import { SUGGESTED_CLASSIFICATION } from "@shared/classification";
import {
  createDocumentReducer,
  initialDocumentState,
  toProjectState,
  type DocumentAction,
  type DocumentState,
} from "./useProject";
import type { ManuscriptLine, MocquereauProject } from "../lib/models";
import { boxesInView } from "@shared/box-frame";

const BOX = { x: 0, y: 0, w: 0.25, h: 0.5 };

function makeProject(lineOverrides: Partial<ManuscriptLine> = {}): MocquereauProject {
  return {
    meta: { title: "T", author: "A", createdAt: "2026-01-01", updatedAt: "2026-01-01" },
    text: { raw: "", words: [], hyphenationMode: "sung" },
    sections: [],
    classification: SUGGESTED_CLASSIFICATION,
    sources: [
      {
        id: "S1",
        order: 1,
        metadata: { siglum: "X", library: "", city: "", century: "", classes: [null, null, null] },
        lines: [
          {
            id: "L1",
            image: { dataUrl: "data:,", width: 200, height: 100, mimeType: "image/png" },
            syllableRange: { start: 0, end: 1 },
            dividers: [],
            gaps: [],
            syllableBoxes: { 0: BOX },
            confirmed: true,
            ...lineOverrides,
          },
        ],
        syllableCuts: {},
      },
    ],
  };
}

function harness() {
  let clock = 0;
  const reduce = createDocumentReducer(() => clock);
  let state: DocumentState = initialDocumentState;
  return {
    dispatch(action: DocumentAction): DocumentState {
      state = reduce(state, action);
      return state;
    },
    tick(ms: number) {
      clock += ms;
    },
    get view() {
      return toProjectState(state);
    },
    get doc() {
      return state;
    },
  };
}

const rotate = (rotation: number): DocumentAction => ({
  type: "UPDATE_LINE_ADJUSTMENTS",
  payload: { sourceId: "S1", lineId: "L1", adjustments: { rotation } },
});
const firstLine = (p: MocquereauProject | null) => p!.sources[0].lines[0];

describe("documentReducer", () => {
  it("SET_PROJECT loads clean with nothing to undo", () => {
    const h = harness();
    h.dispatch({ type: "SET_PROJECT", payload: makeProject() });
    expect(h.view.isDirty).toBe(false);
    expect(h.doc.history.past).toHaveLength(0);
  });

  it("edits are dirty; undo back to the loaded state is clean; redo is dirty", () => {
    const h = harness();
    h.dispatch({ type: "SET_PROJECT", payload: makeProject() });
    h.dispatch({ type: "SET_META", payload: { title: "Puer" } });
    expect(h.view.isDirty).toBe(true);
    h.dispatch({ type: "UNDO" });
    expect(h.view.project!.meta.title).toBe("T");
    expect(h.view.isDirty).toBe(false);
    h.dispatch({ type: "REDO" });
    expect(h.view.project!.meta.title).toBe("Puer");
    expect(h.view.isDirty).toBe(true);
  });

  it("typing in the title coalesces within one second", () => {
    const h = harness();
    h.dispatch({ type: "SET_PROJECT", payload: makeProject() });
    for (const title of ["P", "Pu", "Pue", "Puer"]) {
      h.dispatch({ type: "SET_META", payload: { title } });
      h.tick(300);
    }
    expect(h.doc.history.past).toHaveLength(1);
    h.tick(2000);
    h.dispatch({ type: "SET_META", payload: { title: "Puer natus" } });
    expect(h.doc.history.past).toHaveLength(2);
  });

  it("SAVE_SUCCESS marks the save point", () => {
    const h = harness();
    h.dispatch({ type: "SET_PROJECT", payload: makeProject() });
    h.dispatch({ type: "SET_META", payload: { title: "A" } });
    h.dispatch({ type: "SAVE_SUCCESS" });
    expect(h.view.isDirty).toBe(false);
    h.dispatch({ type: "UNDO" });
    expect(h.view.isDirty).toBe(true);
    h.dispatch({ type: "REDO" });
    expect(h.view.isDirty).toBe(false);
  });

  it("edit during save stays dirty (B2): the save point is the snapshot sent to main", () => {
    const h = harness();
    h.dispatch({ type: "SET_PROJECT", payload: makeProject() });
    h.dispatch({ type: "SET_META", payload: { title: "A" } });
    const sent = h.view.project; // captured before the IPC call
    h.tick(5000);
    h.dispatch({ type: "SET_META", payload: { author: "typed while saving" } });
    h.dispatch({ type: "SAVE_SUCCESS", payload: { project: sent } });
    expect(h.view.isDirty).toBe(true);
    h.dispatch({ type: "UNDO" });
    expect(h.view.project).toBe(sent);
    expect(h.view.isDirty).toBe(false);
  });

  it("SAVE_SUCCESS with the current snapshot is clean", () => {
    const h = harness();
    h.dispatch({ type: "SET_PROJECT", payload: makeProject() });
    h.dispatch({ type: "SET_META", payload: { title: "A" } });
    h.dispatch({ type: "SAVE_SUCCESS", payload: { project: h.view.project } });
    expect(h.view.isDirty).toBe(false);
  });

  it("SET_FILE_PATH is outside history and survives undo", () => {
    const h = harness();
    h.dispatch({ type: "SET_PROJECT", payload: makeProject() });
    h.dispatch({ type: "SET_META", payload: { title: "A" } });
    h.dispatch({ type: "SET_FILE_PATH", payload: "/x.mocquereau" });
    expect(h.doc.history.past).toHaveLength(1);
    h.dispatch({ type: "UNDO" });
    expect(h.view.currentFilePath).toBe("/x.mocquereau");
  });

  it("RESET clears project, path and history", () => {
    const h = harness();
    h.dispatch({ type: "SET_PROJECT", payload: makeProject() });
    h.dispatch({ type: "SET_FILE_PATH", payload: "/x.mocquereau" });
    h.dispatch({ type: "SET_META", payload: { title: "A" } });
    h.dispatch({ type: "RESET" });
    expect(h.view).toEqual({ project: null, isDirty: false, currentFilePath: null });
    expect(h.doc.history.past).toHaveLength(0);
  });

  it("LOAD_PROJECT with dirty:true starts dirty (new, never saved project)", () => {
    const h = harness();
    h.dispatch({ type: "LOAD_PROJECT", payload: { project: makeProject(), dirty: true } });
    expect(h.view.isDirty).toBe(true);
  });

  it("REPLACE_PROJECT is undoable and dirty (hyphenation migration)", () => {
    const h = harness();
    const original = makeProject();
    h.dispatch({ type: "SET_PROJECT", payload: original });
    h.dispatch({ type: "REPLACE_PROJECT", payload: makeProject({ id: "L2" }) });
    expect(h.view.isDirty).toBe(true);
    h.dispatch({ type: "UNDO" });
    expect(h.view.project).toBe(original);
  });

  it("no-op actions return the very same state", () => {
    const h = harness();
    const s = h.dispatch({ type: "SET_PROJECT", payload: makeProject() });
    const after = h.dispatch({
      type: "UPDATE_LINE_ADJUSTMENTS",
      payload: { sourceId: "nope", lineId: "L1", adjustments: { rotation: 90 } },
    });
    expect(after).toBe(s);
  });

  it("a rotation is one undoable step and does not touch the stored boxes", () => {
    const h = harness();
    const original = makeProject();
    h.dispatch({ type: "SET_PROJECT", payload: original });
    h.dispatch(rotate(90));
    expect(firstLine(h.view.project).syllableBoxes).toBe(firstLine(original).syllableBoxes);
    expect(firstLine(h.view.project).boxFrame).toEqual({ rotation: 0, flipH: false, flipV: false });
    expect(h.doc.history.past).toHaveLength(1);
    h.dispatch({ type: "UNDO" });
    expect(h.view.project).toBe(original);
  });

  it("dragging the rotation slider 0 -> 30 -> 0 is one step and the boxes do not drift", () => {
    const h = harness();
    h.dispatch({ type: "SET_PROJECT", payload: makeProject() });
    for (let d = 1; d <= 30; d++) {
      h.dispatch(rotate(d));
      h.tick(16);
    }
    for (let d = 29; d >= 0; d--) {
      h.dispatch(rotate(d));
      h.tick(16);
    }
    expect(h.doc.history.past).toHaveLength(1);
    expect(firstLine(h.view.project).syllableBoxes![0]).toBe(BOX);
    expect(boxesInView(firstLine(h.view.project))[0]).toBe(BOX);
  });

  it("slider 0 -> 90 in 1-degree steps shows exactly what a direct 90 shows (no accumulation)", () => {
    const stepped = harness();
    stepped.dispatch({ type: "SET_PROJECT", payload: makeProject() });
    for (let d = 1; d <= 90; d++) {
      stepped.dispatch(rotate(d));
      stepped.tick(16);
    }
    const direct = harness();
    direct.dispatch({ type: "SET_PROJECT", payload: makeProject() });
    direct.dispatch(rotate(90));
    expect(firstLine(stepped.view.project).syllableBoxes![0]).toBe(BOX);
    expect(boxesInView(firstLine(stepped.view.project))).toEqual(boxesInView(firstLine(direct.view.project)));
    const v = boxesInView(firstLine(stepped.view.project))[0]!;
    expect(v.x).toBeCloseTo(0.5, 12);
    expect(v.y).toBeCloseTo(0, 12);
    expect(v.w).toBeCloseTo(0.5, 12);
    expect(v.h).toBeCloseTo(0.25, 12);
  });
});

describe("SET_LINE_BOX_FRAME", () => {
  const R0 = { rotation: 0, flipH: false, flipV: false };
  const R5 = { rotation: 5, flipH: false, flipV: false };
  const ADJ5 = {
    brightness: 100,
    contrast: 100,
    saturation: 100,
    grayscale: 0,
    invert: false,
    rotation: 5,
    flipH: false,
    flipV: false,
  };

  it("reinterprets the stored boxes in another frame, keeps adjustments, one undo step", () => {
    const h = harness();
    h.dispatch({ type: "SET_PROJECT", payload: makeProject({ imageAdjustments: ADJ5, boxFrame: R5 }) });
    const loaded = h.view.project;
    h.dispatch({ type: "SET_LINE_BOX_FRAME", payload: [{ lineId: "L1", frame: R0 }] });
    const line = firstLine(h.view.project);
    expect(line.boxFrame).toEqual(R0);
    expect(line.imageAdjustments).toEqual(ADJ5);
    expect(line.syllableBoxes).toEqual({ 0: BOX });
    expect(boxesInView(line)).not.toEqual({ 0: BOX });
    expect(h.view.isDirty).toBe(true);
    expect(h.doc.history.past).toHaveLength(1);
    h.dispatch({ type: "UNDO" });
    expect(h.view.project).toBe(loaded);
    expect(h.view.isDirty).toBe(false);
  });

  it("accepts a single update and ignores no-ops and unknown lines", () => {
    const h = harness();
    h.dispatch({ type: "SET_PROJECT", payload: makeProject({ imageAdjustments: ADJ5 }) });
    const before = h.doc;
    h.dispatch({ type: "SET_LINE_BOX_FRAME", payload: { lineId: "L1", frame: R5 } });
    h.dispatch({ type: "SET_LINE_BOX_FRAME", payload: { lineId: "nope", frame: R0 } });
    expect(h.doc).toBe(before);
    h.dispatch({ type: "SET_LINE_BOX_FRAME", payload: { lineId: "L1", frame: R0 } });
    expect(firstLine(h.view.project).boxFrame).toEqual(R0);
  });
});
