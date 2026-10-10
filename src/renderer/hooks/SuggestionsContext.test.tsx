// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { SuggestionsProvider, useSuggestions } from "./SuggestionsContext";
import { RecortesProvider, useRecortesContext } from "./RecortesContext";
import { ProjectContext, createNewProject, useProject, useProjectReducer } from "./useProject";
import { syllabifyText } from "../lib/syllabify";
import { NeumeDetectCancelledError } from "../lib/neume-detect";
import type { NeumeDetectClient, SuggestInput, SuggestResult } from "../lib/neume-detect";
import type { ManuscriptLine, ManuscriptSource, MocquereauAPI, MocquereauProject, SyllableBox } from "../lib/models";

const planControl = vi.hoisted(() => ({ throws: false }));
vi.mock("../lib/suggest/request", async (importOriginal) => {
  const mod = await importOriginal<typeof import("../lib/suggest/request")>();
  return {
    ...mod,
    planSuggestion: (...args: Parameters<typeof mod.planSuggestion>) => {
      if (planControl.throws) throw new Error("plan");
      return mod.planSuggestion(...args);
    },
  };
});

vi.mock("../lib/suggest/raster", () => ({
  loadSuggestImage: vi.fn(async () => ({})),
  renderSuggestRaster: vi.fn(() => ({ data: new Uint8ClampedArray(10 * 10 * 4), width: 10, height: 10 })),
}));

const IMG = { dataUrl: "data:,", width: 100, height: 50, mimeType: "image/png" };
const B0: SyllableBox = { x: 0.0, y: 0.2, w: 0.1, h: 0.2 };
const B1: SyllableBox = { x: 0.2, y: 0.2, w: 0.1, h: 0.2 };
const B2: SyllableBox = { x: 0.4, y: 0.2, w: 0.1, h: 0.2 };
const DRAWN: SyllableBox = { x: 0.25, y: 0.3, w: 0.05, h: 0.1 };

// ── Fake client: every request is a deferred the test settles ───────────────

interface Call {
  id: number;
  input: SuggestInput;
  resolve(r: SuggestResult): void;
  reject(e: unknown): void;
}

function fakeClient() {
  const calls: Call[] = [];
  let next = 1;
  const client = {
    calls,
    cancel: vi.fn(),
    dispose: vi.fn(),
    suggest(input: SuggestInput) {
      const id = next++;
      let resolve!: (r: SuggestResult) => void;
      let reject!: (e: unknown) => void;
      const result = new Promise<SuggestResult>((res, rej) => {
        resolve = res;
        reject = rej;
      });
      calls.push({ id, input, resolve, reject });
      return { id, result };
    },
  } satisfies NeumeDetectClient & { calls: Call[] };
  return client;
}

function result(boxes: Record<number, SyllableBox>, needsBand = false): SuggestResult {
  return {
    suggestions: Object.entries(boxes).map(([i, box]) => ({ index: Number(i), box, confidence: 0.9 })),
    debug: { needsBand } as SuggestResult["debug"],
  };
}

// ── Harness: real document reducer (history, dirty), real Recortes provider ──

function page(id: string, extra: Partial<ManuscriptLine> = {}): ManuscriptLine {
  return { id, image: IMG, syllableRange: { start: 0, end: 6 }, dividers: [], gaps: [], syllableBoxes: {}, confirmed: false, ...extra };
}

function makeProject(lines: ManuscriptLine[] = [page("a1"), page("a2")]): MocquereauProject {
  const raw = "Puer natus est nobis";
  const src: ManuscriptSource = {
    id: "A",
    order: 1,
    metadata: { siglum: "A", library: "", city: "", century: "", classes: [null, null, null] },
    lines,
    syllableCuts: {},
  };
  return { ...createNewProject("T", ""), text: { raw, words: syllabifyText(raw, "sung"), hyphenationMode: "sung" }, sources: [src] };
}

let bridge: { getSuggestionsEnabled: ReturnType<typeof vi.fn>; setSuggestionsEnabled: ReturnType<typeof vi.fn> };

beforeEach(() => {
  bridge = {
    getSuggestionsEnabled: vi.fn().mockResolvedValue(true),
    setSuggestionsEnabled: vi.fn(async (on: boolean) => on),
  };
  window.mocquereau = bridge as unknown as MocquereauAPI;
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  planControl.throws = false;
});

async function setup(opts: { enabled?: boolean; project?: MocquereauProject } = {}) {
  bridge.getSuggestionsEnabled.mockResolvedValue(opts.enabled ?? true);
  const client = fakeClient();
  const createClient = vi.fn(() => client);
  function Wrapper({ children }: { children: ReactNode }) {
    const [state, dispatch, history] = useProjectReducer();
    return (
      <ProjectContext.Provider value={{ state, dispatch, history }}>
        <RecortesProvider>
          <SuggestionsProvider createClient={createClient}>{children}</SuggestionsProvider>
        </RecortesProvider>
      </ProjectContext.Provider>
    );
  }
  const hook = renderHook(() => ({ s: useSuggestions(), p: useProject(), r: useRecortesContext() }), { wrapper: Wrapper });
  act(() => hook.result.current.p.dispatch({ type: "SET_PROJECT", payload: opts.project ?? makeProject() }));
  await act(async () => {}); // preference from the bridge
  const value = () => hook.result.current.s;
  const line = (id: string) => hook.result.current.p.state.project!.sources[0].lines.find((l) => l.id === id)!;
  const select = (id: string) => act(() => hook.result.current.r.selectLine("A", id));
  const dispatch = hook.result.current.p.dispatch;
  return { hook, client, createClient, value, line, select, dispatch };
}

/** suggest() on the active page and wait for the request to reach the client. */
async function startSuggest(h: Awaited<ReturnType<typeof setup>>, n = h.client.calls.length + 1) {
  act(() => h.value().suggest());
  await waitFor(() => expect(h.client.calls.length).toBe(n));
  return h.client.calls[n - 1];
}

async function settle(fn: () => void) {
  await act(async () => {
    fn();
    await Promise.resolve();
  });
}

describe("SuggestionsProvider", () => {
  it("Sugerir começa na sílaba ativa", async () => {
    const h = await setup();
    act(() => h.hook.result.current.r.setActiveSyllable(3));
    const call = await startSuggest(h);
    expect(call.input.syllables[0].index).toBe(3);
  });

  it("sugerir -> caixas ativas -> aceitar todas = um UPDATE_LINE_BOXES e um passo de desfazer", async () => {
    const h = await setup();
    expect(h.hook.result.current.r.activeLineId).toBe("a1");
    const call = await startSuggest(h);
    expect(h.value().status).toBe("running");
    expect(call.input.syllables.map((s) => s.index)).toEqual([0, 1, 2, 3, 4, 5, 6]);
    expect(call.input.image.width).toBe(10);

    await settle(() => call.resolve(result({ 0: B0, 1: B1, 2: B2 })));
    expect(h.value().status).toBe("idle");
    expect(h.value().active).toEqual({ 0: B0, 1: B1, 2: B2 });
    expect(h.hook.result.current.p.history!.canUndo).toBe(false);

    act(() => h.value().acceptAll());
    expect(h.line("a1").syllableBoxes).toEqual({ 0: B0, 1: B1, 2: B2 });
    expect(h.line("a1").confirmed).toBe(true);
    expect(h.value().active).toEqual({});

    act(() => h.hook.result.current.p.history!.undo());
    expect(h.line("a1").syllableBoxes).toEqual({});
    expect(h.line("a1").confirmed).toBe(false);
    // One step: nothing left to undo.
    expect(h.hook.result.current.p.history!.canUndo).toBe(false);
  });

  it("aceitar não sobrescreve caixa desenhada durante a execução nem null legado", async () => {
    const h = await setup();
    const call = await startSuggest(h);
    // While the worker runs: a box drawn on 1 and a legacy null on 2.
    act(() =>
      h.dispatch({ type: "UPDATE_LINE_BOXES", payload: { sourceId: "A", lineId: "a1", syllableBoxes: { 1: DRAWN, 2: null } } }),
    );
    await settle(() => call.resolve(result({ 0: B0, 1: B1, 2: B2 })));
    expect(h.value().active).toEqual({ 0: B0 });

    act(() => h.value().accept(1));
    act(() => h.value().accept(2));
    expect(h.line("a1").syllableBoxes).toEqual({ 1: DRAWN, 2: null });

    act(() => h.value().acceptAll());
    expect(h.line("a1").syllableBoxes).toEqual({ 0: B0, 1: DRAWN, 2: null });
  });

  it("dois accept no mesmo handler: cada um lê as caixas atuais, as duas ficam", async () => {
    const h = await setup();
    const call = await startSuggest(h);
    await settle(() => call.resolve(result({ 0: B0, 1: B1, 2: B2 })));
    act(() => {
      const v = h.value();
      v.accept(0);
      v.accept(1);
    });
    expect(h.line("a1").syllableBoxes).toEqual({ 0: B0, 1: B1 });
    expect(h.value().active).toEqual({ 2: B2 });
    // Same stale value again: nothing re-accepted, nothing lost.
    act(() => {
      const v = h.value();
      v.accept(2);
      v.acceptAll();
    });
    expect(h.line("a1").syllableBoxes).toEqual({ 0: B0, 1: B1, 2: B2 });
  });

  it("girar a página descarta as sugestões dela; trocar de página conserva", async () => {
    const h = await setup();
    const call = await startSuggest(h);
    await settle(() => call.resolve(result({ 0: B0, 1: B1 })));
    expect(h.value().active).toEqual({ 0: B0, 1: B1 });

    h.select("a2");
    expect(h.value().active).toEqual({});
    h.select("a1");
    expect(h.value().active).toEqual({ 0: B0, 1: B1 });

    act(() => h.dispatch({ type: "UPDATE_LINE_ADJUSTMENTS", payload: { sourceId: "A", lineId: "a1", adjustments: { rotation: 90 } } }));
    expect(h.value().active).toEqual({});
    // Discarded, not hidden: turning back does not bring them back.
    act(() => h.dispatch({ type: "UPDATE_LINE_ADJUSTMENTS", payload: { sourceId: "A", lineId: "a1", adjustments: { rotation: 0 } } }));
    expect(h.value().active).toEqual({});
  });

  it("resultado de pedido feito na página A chega em A mesmo com a página B ativa", async () => {
    const h = await setup();
    const call = await startSuggest(h);
    h.select("a2");
    expect(h.value().status).toBe("running"); // busy is global: Cancelar shows on every page
    await settle(() => call.resolve(result({ 0: B0 })));
    expect(h.value().status).toBe("idle");
    expect(h.value().active).toEqual({});
    h.select("a1");
    expect(h.value().active).toEqual({ 0: B0 });
    expect(h.line("a2").syllableBoxes).toEqual({});
  });

  it("erro do worker: status volta a idle, notice error, sem exceção", async () => {
    const h = await setup();
    const call = await startSuggest(h);
    await settle(() => call.reject(new Error("boom")));
    expect(h.value().status).toBe("idle");
    expect(h.value().notice).toBe("error");
    expect(h.value().active).toEqual({});
    // A new request is possible afterwards.
    await startSuggest(h, 2);
  });

  it("cancelar: status idle, resultado posterior ignorado", async () => {
    const h = await setup();
    const call = await startSuggest(h);
    act(() => h.value().cancel());
    expect(h.value().status).toBe("idle");
    expect(h.client.cancel).toHaveBeenCalledWith(call.id);
    await settle(() => call.resolve(result({ 0: B0 })));
    expect(h.value().active).toEqual({});
    expect(h.value().notice).toBeNull();
    expect(h.value().status).toBe("idle");
  });

  it("cancelamento do worker é silencioso", async () => {
    const h = await setup();
    const call = await startSuggest(h);
    await settle(() => call.reject(new NeumeDetectCancelledError(call.id)));
    expect(h.value().status).toBe("idle");
    expect(h.value().notice).toBeNull();
  });

  it("preferência desligada: suggest não cria cliente", async () => {
    const h = await setup({ enabled: false });
    expect(h.value().enabled).toBe(false);
    act(() => h.value().suggest());
    await act(async () => {});
    expect(h.createClient).not.toHaveBeenCalled();
    expect(h.value().status).toBe("idle");
  });

  it("preferência ainda não carregada: desligada, suggest não cria cliente", async () => {
    let answer!: (on: boolean) => void;
    bridge.getSuggestionsEnabled.mockImplementation(() => new Promise<boolean>((res) => (answer = res)));
    const client = fakeClient();
    const createClient = vi.fn(() => client);
    function Wrapper({ children }: { children: ReactNode }) {
      const [state, dispatch, history] = useProjectReducer();
      return (
        <ProjectContext.Provider value={{ state, dispatch, history }}>
          <RecortesProvider>
            <SuggestionsProvider createClient={createClient}>{children}</SuggestionsProvider>
          </RecortesProvider>
        </ProjectContext.Provider>
      );
    }
    const hook = renderHook(() => ({ s: useSuggestions(), p: useProject() }), { wrapper: Wrapper });
    act(() => hook.result.current.p.dispatch({ type: "SET_PROJECT", payload: makeProject() }));
    expect(hook.result.current.s.enabled).toBe(false);
    act(() => hook.result.current.s.suggest());
    await act(async () => {});
    expect(createClient).not.toHaveBeenCalled();
    // Once the main says on, suggest works.
    await act(async () => answer(true));
    expect(hook.result.current.s.enabled).toBe(true);
    act(() => hook.result.current.s.suggest());
    await waitFor(() => expect(client.calls.length).toBe(1));
  });

  it("desligar a preferência grava na main, descarta tudo e encerra o worker", async () => {
    const h = await setup();
    const call = await startSuggest(h);
    await settle(() => call.resolve(result({ 0: B0 })));
    act(() => h.value().setEnabled(false));
    expect(bridge.setSuggestionsEnabled).toHaveBeenCalledWith(false);
    expect(h.value().enabled).toBe(false);
    expect(h.value().active).toEqual({});
    expect(h.client.dispose).toHaveBeenCalledTimes(1);
  });

  it("sugestões não marcam o projeto como editado", async () => {
    const h = await setup();
    const before = h.hook.result.current.p.state.project;
    const call = await startSuggest(h);
    await settle(() => call.resolve(result({ 0: B0, 1: B1 })));
    act(() => h.value().reject(1));
    act(() => h.value().discardPage());
    expect(h.hook.result.current.p.state.isDirty).toBe(false);
    expect(h.hook.result.current.p.history!.canUndo).toBe(false);
    expect(h.hook.result.current.p.state.project).toBe(before);
  });

  it("reject: some; a fonte inteira trata a sílaba como suggest:false; um Sugerir explícito a esquece", async () => {
    const h = await setup({ project: makeProject([page("a1")]) });
    const first = await startSuggest(h);
    await settle(() => first.resolve(result({ 0: B0, 1: B1, 2: B2 })));
    act(() => h.value().reject(1));
    expect(h.value().active).toEqual({ 0: B0, 2: B2 });

    // "Sugerir em todas as páginas" keeps the page's rejections.
    let done = false;
    act(() => {
      void h.value().suggestSource().then(() => (done = true));
    });
    await waitFor(() => expect(h.client.calls.length).toBe(2));
    const second = h.client.calls[1];
    expect(second.input.syllables.find((s) => s.index === 1)!.suggest).toBe(false);
    expect(second.input.syllables.filter((s) => s.index !== 1).every((s) => s.suggest !== false)).toBe(true);
    await settle(() => second.resolve(result({ 0: B0, 2: B2 })));
    await waitFor(() => expect(done).toBe(true));

    // An explicit Sugerir on the page recovers a mistaken Delete.
    const third = await startSuggest(h, 3);
    expect(third.input.syllables.every((s) => s.suggest !== false)).toBe(true);
  });

  it("planSuggestion que lança vira aviso error, sem rejeição não tratada", async () => {
    const h = await setup();
    planControl.throws = true;
    act(() => h.value().suggest());
    await act(async () => {});
    expect(h.value().notice).toBe("error");
    expect(h.value().status).toBe("idle");
    expect(h.client.calls).toHaveLength(0);
    let out: unknown = null;
    await act(async () => {
      out = await h.value().suggestSource();
    });
    expect(out).toEqual({ skipped: [] });
  });

  it("nada a sugerir na página (tudo com caixa): nenhum aviso, nenhum pedido", async () => {
    const full: Record<number, SyllableBox> = {};
    for (let i = 0; i <= 6; i++) full[i] = { x: i / 10, y: 0.2, w: 0.05, h: 0.2 };
    const h = await setup({ project: makeProject([page("a1", { syllableBoxes: full })]) });
    act(() => h.value().suggest());
    await act(async () => {});
    expect(h.value().notice).toBeNull();
    expect(h.client.calls).toHaveLength(0);
  });

  it("discardPage: some a página ativa, as outras ficam", async () => {
    const h = await setup();
    const a = await startSuggest(h);
    await settle(() => a.resolve(result({ 0: B0 })));
    h.select("a2");
    const b = await startSuggest(h, 2);
    await settle(() => b.resolve(result({ 1: B1 })));
    act(() => h.value().discardPage());
    expect(h.value().active).toEqual({});
    h.select("a1");
    expect(h.value().active).toEqual({ 0: B0 });
  });

  it("needsBand e nada encontrado viram aviso", async () => {
    const h = await setup();
    const a = await startSuggest(h);
    await settle(() => a.resolve(result({}, true)));
    expect(h.value().notice).toBe("needsBand");
    const b = await startSuggest(h, 2);
    await settle(() => b.resolve(result({})));
    expect(h.value().notice).toBe("none");
  });

  it("suggestSource percorre as páginas e devolve as que precisam de área", async () => {
    const h = await setup();
    let done: { skipped: string[] } | null = null;
    act(() => {
      void h.value().suggestSource().then((r) => (done = r));
    });
    await waitFor(() => expect(h.client.calls.length).toBe(1));
    await settle(() => h.client.calls[0].resolve(result({}, true)));
    await waitFor(() => expect(h.client.calls.length).toBe(2));
    await settle(() => h.client.calls[1].resolve(result({ 0: B0 })));
    await waitFor(() => expect(done).toEqual({ skipped: ["a1"] }));
    h.select("a2");
    expect(h.value().active).toEqual({ 0: B0 });
  });

  it("suggestSource é global: running em outra página, Sugerir espera, cancelar para as páginas restantes", async () => {
    const h = await setup({ project: makeProject([page("a1"), page("a2"), page("a3")]) });
    let done: { skipped: string[] } | null = null;
    act(() => {
      void h.value().suggestSource().then((r) => (done = r));
    });
    await waitFor(() => expect(h.client.calls.length).toBe(1));
    await settle(() => h.client.calls[0].resolve(result({ 0: B0 })));
    await waitFor(() => expect(h.client.calls.length).toBe(2));
    // Another page than the one being suggested: still busy, plain Sugerir does nothing.
    h.select("a3");
    expect(h.value().status).toBe("running");
    act(() => h.value().suggest());
    await act(async () => {});
    expect(h.client.calls).toHaveLength(2);
    act(() => h.value().cancel());
    expect(h.value().status).toBe("idle");
    expect(h.client.cancel).toHaveBeenCalledWith(h.client.calls[1].id);
    await settle(() => h.client.calls[1].resolve(result({ 1: B1 })));
    await waitFor(() => expect(done).toEqual({ skipped: [] }));
    expect(h.client.calls).toHaveLength(2); // a3 never asked
    h.select("a2");
    expect(h.value().active).toEqual({});
  });

  it("suggestSource: cancelar entre páginas (sem pedido em voo) também para o laço", async () => {
    const h = await setup({ project: makeProject([page("a1"), page("a2")]) });
    let done: { skipped: string[] } | null = null;
    act(() => {
      void h.value().suggestSource().then((r) => (done = r));
    });
    await waitFor(() => expect(h.client.calls.length).toBe(1));
    // Resolve and cancel in the same tick: the loop must not start a2.
    await act(async () => {
      h.client.calls[0].resolve(result({ 0: B0 }));
      h.value().cancel();
      await Promise.resolve();
    });
    await waitFor(() => expect(done).not.toBeNull());
    expect(h.client.calls).toHaveLength(1);
    expect(h.value().status).toBe("idle");
  });

  it("suggestSource: desligar a preferência no meio para o laço", async () => {
    const h = await setup({ project: makeProject([page("a1"), page("a2"), page("a3")]) });
    let done: { skipped: string[] } | null = null;
    act(() => {
      void h.value().suggestSource().then((r) => (done = r));
    });
    await waitFor(() => expect(h.client.calls.length).toBe(1));
    act(() => h.value().setEnabled(false));
    expect(h.value().status).toBe("idle");
    await settle(() => h.client.calls[0].resolve(result({ 0: B0 })));
    await waitFor(() => expect(done).not.toBeNull());
    expect(h.client.calls).toHaveLength(1);
  });

  it("Esc (discardPage) cancela a fonte inteira", async () => {
    const h = await setup({ project: makeProject([page("a1"), page("a2")]) });
    let done: { skipped: string[] } | null = null;
    act(() => {
      void h.value().suggestSource().then((r) => (done = r));
    });
    await waitFor(() => expect(h.client.calls.length).toBe(1));
    h.select("a2");
    act(() => h.value().discardPage());
    expect(h.value().status).toBe("idle");
    await settle(() => h.client.calls[0].resolve(result({ 0: B0 })));
    await waitFor(() => expect(done).not.toBeNull());
    expect(h.client.calls).toHaveLength(1);
  });
});
