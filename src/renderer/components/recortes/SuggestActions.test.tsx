// @vitest-environment jsdom
import "../../i18n";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { SuggestActions } from "./SuggestActions";
import { SuggestionsProvider } from "../../hooks/SuggestionsContext";
import { RecortesProvider } from "../../hooks/RecortesContext";
import { ProjectContext, createNewProject, useProjectReducer, type DocumentAction } from "../../hooks/useProject";
import { syllabifyText } from "../../lib/syllabify";
import type { NeumeDetectClient, SuggestInput, SuggestResult } from "../../lib/neume-detect";
import type { ManuscriptLine, MocquereauAPI, MocquereauProject, SyllableBox } from "../../lib/models";

vi.mock("../../lib/suggest/raster", () => ({
  loadSuggestImage: vi.fn(async () => ({})),
  renderSuggestRaster: vi.fn(() => ({ data: new Uint8ClampedArray(10 * 10 * 4), width: 10, height: 10 })),
}));

const IMG = { dataUrl: "data:,", width: 100, height: 50, mimeType: "image/png" };
const B: SyllableBox = { x: 0.1, y: 0.2, w: 0.1, h: 0.2 };

function fakeClient() {
  const calls: Array<{ input: SuggestInput; resolve(r: SuggestResult): void }> = [];
  let next = 1;
  return {
    calls,
    cancel: vi.fn(),
    dispose: vi.fn(),
    suggest(input: SuggestInput) {
      const id = next++;
      let resolve!: (r: SuggestResult) => void;
      const result = new Promise<SuggestResult>((res) => (resolve = res));
      calls.push({ input, resolve });
      return { id, result };
    },
  } satisfies NeumeDetectClient & { calls: unknown[] };
}

function result(boxes: Record<number, SyllableBox>): SuggestResult {
  return {
    suggestions: Object.entries(boxes).map(([i, box]) => ({ index: Number(i), box, confidence: 0.9 })),
    debug: { needsBand: false } as SuggestResult["debug"],
  };
}

function makeProject(line: Partial<ManuscriptLine> = {}): MocquereauProject {
  const raw = "Puer natus est";
  const l: ManuscriptLine = {
    id: "a1",
    image: IMG,
    syllableRange: { start: 0, end: 4 },
    dividers: [],
    gaps: [],
    syllableBoxes: {},
    confirmed: false,
    ...line,
  };
  return {
    ...createNewProject("T", ""),
    text: { raw, words: syllabifyText(raw, "sung"), hyphenationMode: "sung" },
    sources: [{ id: "A", order: 1, metadata: { siglum: "A", library: "", city: "", century: "", classes: [null, null, null] }, lines: [l], syllableCuts: {} }],
  };
}

let enabled = true;
beforeEach(() => {
  enabled = true;
  window.mocquereau = {
    getSuggestionsMode: vi.fn(async () => (enabled ? "sequential" : "off")),
    setSuggestionsMode: vi.fn(async (m: string) => m),
  } as unknown as MocquereauAPI;
});
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

async function mount(project = makeProject()) {
  const client = fakeClient();
  const ref: { dispatch?: React.Dispatch<DocumentAction> } = {};
  function Harness() {
    const [state, dispatch, history] = useProjectReducer();
    ref.dispatch = dispatch;
    return (
      <ProjectContext.Provider value={{ state, dispatch, history }}>
        <RecortesProvider>
          <SuggestionsProvider createClient={() => client}>{state.project && <SuggestActions />}</SuggestionsProvider>
        </RecortesProvider>
      </ProjectContext.Provider>
    );
  }
  const utils = render(<Harness />);
  act(() => ref.dispatch!({ type: "SET_PROJECT", payload: project }));
  await act(async () => {});
  return { ...utils, client };
}

describe("SuggestActions (S2)", () => {
  it("Sugerir -> Cancelar durante a execução -> Aceitar N ao lado com sugestões", async () => {
    const v = await mount();
    const run = screen.getByRole("button", { name: "Sugerir" });
    expect(run.className).toContain("sc-btn--filled");
    expect(screen.queryByRole("button", { name: /Aceitar/ })).toBeNull();

    fireEvent.click(run);
    await waitFor(() => expect(v.client.calls).toHaveLength(1));
    const cancel = screen.getByRole("button", { name: "Cancelar" });
    expect(cancel.className).toContain("sc-btn--filled");

    await act(async () => {
      v.client.calls[0].resolve(result({ 1: B, 2: B }));
      await Promise.resolve();
    });
    const accept = screen.getByRole("button", { name: "Aceitar 2" });
    expect(accept.className).toContain("sc-btn--tonal");
    // Aceitar fica à esquerda de Sugerir.
    const buttons = screen.getAllByRole("button").map((b) => b.textContent);
    expect(buttons).toEqual(["Aceitar 2", "Sugerir"]);

    fireEvent.click(accept);
    expect(screen.queryByRole("button", { name: /Aceitar/ })).toBeNull();
  });

  it("Cancelar interrompe a execução", async () => {
    const v = await mount();
    fireEvent.click(screen.getByRole("button", { name: "Sugerir" }));
    await waitFor(() => expect(v.client.calls).toHaveLength(1));
    fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));
    expect(v.client.cancel).toHaveBeenCalledOnce();
    expect(screen.getByRole("button", { name: "Sugerir" })).toBeTruthy();
  });

  it("preferência desligada: nada renderizado", async () => {
    enabled = false;
    const v = await mount();
    expect(v.container.innerHTML).toBe("");
  });

  it("imagem ausente (missing): Sugerir desabilitado", async () => {
    await mount(makeProject({ image: { ...IMG, missing: true } as never }));
    expect((screen.getByRole("button", { name: "Sugerir" }) as HTMLButtonElement).disabled).toBe(true);
  });
});
