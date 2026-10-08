// @vitest-environment jsdom
import "../../i18n";
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render, screen } from "@testing-library/react";
import { useAddPage, type AddPage } from "./useAddPage";
import { ProjectContext, createNewProject, useProjectReducer, type ProjectState } from "../../hooks/useProject";
import { Toaster } from "../../ui/Toast";
import * as imageUtils from "../../lib/image-utils";
import type { ManuscriptSource } from "../../lib/models";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function mount() {
  const ref: { state?: ProjectState; addPage?: AddPage } = {};
  function Probe() {
    ref.addPage = useAddPage(() => {});
    return null;
  }
  function Harness() {
    const [state, dispatch, history] = useProjectReducer();
    ref.state = state;
    if (!state.project) {
      const source: ManuscriptSource = {
        id: "A",
        order: 1,
        metadata: { siglum: "A", library: "", city: "", century: "", classes: [null, null, null] },
        lines: [],
        syllableCuts: {},
      };
      queueMicrotask(() => dispatch({ type: "SET_PROJECT", payload: { ...createNewProject("T", ""), sources: [source] } }));
      return null;
    }
    return (
      <ProjectContext.Provider value={{ state, dispatch, history }}>
        <Toaster dismissLabel="x">
          <Probe />
        </Toaster>
      </ProjectContext.Provider>
    );
  }
  render(<Harness />);
  return ref;
}

describe("useAddPage: redimensionar", () => {
  it("falha ao redimensionar: mostra o erro, não adiciona a página e não deixa pendência", async () => {
    const ref = mount();
    await act(async () => {});
    window.mocquereau = {
      openImageFile: vi.fn().mockResolvedValue({ dataUrl: "data:image/png;base64,x", width: 3000, height: 1000 }),
    } as never;
    vi.spyOn(imageUtils, "resizeImageIfNeeded").mockRejectedValue(new Error("decode"));
    await act(async () => ref.addPage!.openFile("A"));
    expect(ref.addPage!.resizeCandidate).not.toBeNull();
    await act(async () => ref.addPage!.resolveResize("resize"));
    expect(ref.addPage!.resizeCandidate).toBeNull();
    expect(ref.state!.project!.sources[0].lines).toHaveLength(0);
    expect(screen.getByText("Não foi possível redimensionar a imagem.")).toBeTruthy();
  });
});
