// @vitest-environment jsdom
import "../i18n";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render } from "@testing-library/react";
import { SliceEditor } from "./SliceEditor";
import { ProjectContext, createNewProject, initialStateForTest, useProjectReducer } from "../hooks/useProject";
import { syllabifyText } from "../lib/syllabify";
import type { MocquereauProject, ManuscriptSource } from "../lib/models";

type ProjectAction = Parameters<ReturnType<typeof useProjectReducer>[1]>[0];

const BOX = { x: 0.1, y: 0.1, w: 0.2, h: 0.5 };

function projectWithBox(): MocquereauProject {
  const base = createNewProject("Introito", "");
  const raw = "Puer natus est";
  const source: ManuscriptSource = {
    id: "src-1",
    order: 0,
    metadata: { siglum: "A", library: "", city: "", century: "", folio: "", notation: "adiastematic" },
    lines: [
      {
        id: "line-1",
        image: { dataUrl: "data:image/png;base64,iVBORw0KGgo=", width: 100, height: 50, mimeType: "image/png" },
        syllableRange: { start: 0, end: 3 },
        dividers: [],
        gaps: [],
        syllableBoxes: { 0: BOX },
        confirmed: true,
      },
    ],
    syllableCuts: {},
  };
  return { ...base, text: { raw, words: syllabifyText(raw, "sung"), hyphenationMode: "sung" }, sources: [source] };
}

beforeEach(() => {
  vi.useFakeTimers();
  window.mocquereau = {} as never;
  // jsdom não implementa scrollIntoView (usado pela SyllableRangeBar).
  Element.prototype.scrollIntoView = vi.fn();
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("SliceEditor: sync de caixas ao sair da vista", () => {
  it("edição de caixa feita menos de 300 ms antes de desmontar é despachada, não descartada", () => {
    const dispatch = vi.fn<(action: ProjectAction) => void>();
    const state = { ...initialStateForTest, project: projectWithBox() };
    const { unmount } = render(
      <ProjectContext.Provider value={{ state, dispatch }}>
        <SliceEditor />
      </ProjectContext.Provider>,
    );
    // A sílaba 0 já abre ativa; Delete apaga a caixa dela e o editor passa a divergir da linha.
    act(() => {
      fireEvent.keyDown(window, { key: "Delete" });
    });
    expect(dispatch.mock.calls.filter(([a]) => a.type === "UPDATE_LINE_BOXES")).toHaveLength(0);

    unmount();

    const updates = dispatch.mock.calls.map(([a]) => a).filter((a) => a.type === "UPDATE_LINE_BOXES");
    expect(updates).toHaveLength(1);
    const payload = (updates[0] as Extract<ProjectAction, { type: "UPDATE_LINE_BOXES" }>).payload;
    expect(payload.lineId).toBe("line-1");
    expect(payload.syllableBoxes[0] ?? null).toBeNull();
    expect(payload.confirmed).toBe(false);
  });

  it("sem edição pendente, desmontar não despacha nada", () => {
    const dispatch = vi.fn<(action: ProjectAction) => void>();
    const state = { ...initialStateForTest, project: projectWithBox() };
    const { unmount } = render(
      <ProjectContext.Provider value={{ state, dispatch }}>
        <SliceEditor />
      </ProjectContext.Provider>,
    );
    unmount();
    expect(dispatch.mock.calls.filter(([a]) => a.type === "UPDATE_LINE_BOXES")).toHaveLength(0);
  });
});
