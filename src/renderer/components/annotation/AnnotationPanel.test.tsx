// @vitest-environment jsdom
import "../../i18n";
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { AnnotationPanel } from "./AnnotationPanel";
import type { AnnotationTarget } from "./useAnnotation";
import {
  ProjectContext,
  createNewProject,
  useProjectReducer,
  type DocumentAction,
  type HistoryApi,
  type ProjectState,
} from "../../hooks/useProject";
import type { MocquereauProject } from "../../lib/models";

function mkProject(): MocquereauProject {
  const p = createNewProject("t", "a");
  const src = (id: string, extra: object = {}) => ({
    id,
    order: 1,
    metadata: { siglum: id.toUpperCase(), library: "", city: "", century: "", classes: [null, null, null] as [null, null, null] },
    lines: [],
    syllableCuts: {},
    ...extra,
  });
  return {
    ...p,
    sources: [
      src("s1"),
      src("s2", { annotations: { 0: { neumes: [{ kind: "pes" }, { kind: "virga", notes: 2 }], tags: [] } } }),
      src("s3", { annotations: { 0: { neumes: [], tags: [], certainty: "secure" } } }),
    ],
  } as MocquereauProject;
}

function mount(target: AnnotationTarget | null, onClose = vi.fn()) {
  const ref: { state?: ProjectState; dispatch?: React.Dispatch<DocumentAction>; history?: HistoryApi } = {};
  function Harness() {
    const [state, dispatch, history] = useProjectReducer();
    Object.assign(ref, { state, dispatch, history });
    if (!state.project) return null;
    return (
      <ProjectContext.Provider value={{ state, dispatch, history }}>
        <AnnotationPanel target={target} syllableText="Ad" sourceName="Einsiedeln 121" onClose={onClose} onNext={vi.fn()} />
      </ProjectContext.Provider>
    );
  }
  render(<Harness />);
  act(() => ref.dispatch!({ type: "SET_PROJECT", payload: mkProject() }));
  return { ref, onClose };
}

afterEach(cleanup);

describe("AnnotationPanel", () => {
  it("asks for a syllable when there is no target", () => {
    mount(null);
    const panel = screen.getByRole("complementary", { name: "Anotação" });
    expect(panel.hasAttribute("data-annotation-panel")).toBe(true);
    expect(screen.getByText("Escolha uma sílaba")).toBeTruthy();
    expect(screen.queryByRole("combobox", { name: "Neumas" })).toBeNull();
  });

  it("shows the syllable and source and closes", () => {
    const { onClose } = mount({ sourceId: "s1", syllable: 0 });
    expect(screen.getByText("Ad")).toBeTruthy();
    expect(screen.getByText("Einsiedeln 121")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Fechar painel" }));
    expect(onClose).toHaveBeenCalled();
  });

  it("Copiar de… lists only sources with neumes on that syllable and copies", () => {
    const { ref } = mount({ sourceId: "s1", syllable: 0 });
    fireEvent.click(screen.getByRole("button", { name: "Copiar de…" }));
    const items = screen.getAllByRole("menuitem").map((el) => el.textContent);
    expect(items).toEqual(["S2"]);
    fireEvent.click(screen.getByRole("menuitem", { name: "S2" }));
    expect(ref.state!.project!.sources[0].annotations?.[0].neumes).toEqual([{ kind: "pes" }, { kind: "virga", notes: 2 }]);
    expect(screen.queryByRole("menu")).toBeNull();
  });

  it("disables Copiar de… when no other source has neumes", () => {
    mount({ sourceId: "s1", syllable: 3 });
    expect((screen.getByRole("button", { name: "Copiar de…" }) as HTMLButtonElement).disabled).toBe(true);
  });
});
