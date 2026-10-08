// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { RecortesProvider, useRecortesCommands } from "./RecortesContext";
import { ProjectContext, createNewProject, initialStateForTest, projectReducer } from "./useProject";
import { collectDocxCrops } from "../lib/docx-collect";
import { syllabifyText } from "../lib/syllabify";
import { resolveCellState } from "../lib/tableUtils";
import type { ManuscriptSource, MocquereauProject } from "../lib/models";

// The DOCX crops need a canvas; this test only cares which cells get one.
vi.mock("../lib/sliceUtils", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../lib/sliceUtils")>()),
  computeSyllableCuts: vi.fn(async () => ({})),
}));

afterEach(cleanup);

const IMG = { dataUrl: "data:,", width: 10, height: 10, mimeType: "image/png" };
const BOX = { x: 0.1, y: 0.1, w: 0.1, h: 0.1 };

function setup(syllableCuts: ManuscriptSource["syllableCuts"] = {}) {
  const raw = "Puer natus est nobis";
  const src: ManuscriptSource = {
    id: "A",
    order: 1,
    metadata: { siglum: "A", library: "", city: "", century: "", classes: [null, null, null] },
    lines: [
      { id: "a1", image: IMG, syllableRange: { start: 0, end: 6 }, dividers: [], gaps: [], syllableBoxes: { 0: BOX, 1: BOX }, confirmed: true },
      { id: "a2", image: IMG, syllableRange: { start: 0, end: 6 }, dividers: [], gaps: [], syllableBoxes: { 1: BOX }, confirmed: true },
    ],
    syllableCuts,
  };
  const project: MocquereauProject = {
    ...createNewProject("T", ""),
    text: { raw, words: syllabifyText(raw, "sung"), hyphenationMode: "sung" },
    sources: [src],
  };
  const dispatch = vi.fn();
  const wrapper = ({ children }: { children: ReactNode }) => (
    <ProjectContext.Provider value={{ state: { ...initialStateForTest, project }, dispatch }}>
      <RecortesProvider>{children}</RecortesProvider>
    </ProjectContext.Provider>
  );
  const { result } = renderHook(() => useRecortesCommands(), { wrapper });
  return { result, dispatch, src, project };
}

describe("removeBoxAt", () => {
  it("drops the key (pending), does not write null (gap), in one UPDATE_LINE_BOXES", () => {
    const { result, dispatch, src } = setup();
    result.current.removeBoxAt(0);
    expect(dispatch).toHaveBeenCalledTimes(1);
    const action = dispatch.mock.calls[0][0];
    expect(action.type).toBe("UPDATE_LINE_BOXES");
    expect(action.payload.lineId).toBe("a1");
    expect(0 in action.payload.syllableBoxes).toBe(false);
    expect(action.payload.syllableBoxes[1]).toEqual(BOX);
    // The cell becomes pending and falls through to the next covering page.
    const line = { ...src.lines[0], syllableBoxes: action.payload.syllableBoxes };
    expect(resolveCellState({ ...src, lines: [line, src.lines[1]] }, 0).kind).toBe("unfilled");
    expect(resolveCellState({ ...src, lines: [line, src.lines[1]] }, 1).kind).toBe("filled");
  });

  it("a legacy crop for the syllable goes in the same step: Tabela and DOCX show it pending", async () => {
    const { result, dispatch, project } = setup({ 0: IMG });
    result.current.removeBoxAt(0);
    expect(dispatch).toHaveBeenCalledTimes(1);
    const next = projectReducer({ ...initialStateForTest, project }, dispatch.mock.calls[0][0]).project!;
    expect(0 in next.sources[0].syllableCuts).toBe(false);
    expect(resolveCellState(next.sources[0], 0).kind).toBe("unfilled");
    const payload = await collectDocxCrops(next);
    expect(payload.rows[0].cells[0]).toMatchObject({ pngBuffer: null, isGap: false });
  });
});
