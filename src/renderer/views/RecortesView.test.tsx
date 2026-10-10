// @vitest-environment jsdom
import "../i18n";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useState } from "react";
import { act, cleanup, fireEvent, render, waitFor, within } from "@testing-library/react";
import { RecortesView, isOutsideEditorKeys } from "./RecortesView";
import {
  ProjectContext,
  createNewProject,
  initialStateForTest,
  useProjectReducer,
  type DocumentAction,
  type HistoryApi,
  type ProjectState,
} from "../hooks/useProject";
import { syllabifyText } from "../lib/syllabify";
import { RecortesProvider, useRecortesCommands, useRecortesContext, type RecortesContextValue } from "../hooks/RecortesContext";
import { SuggestionsProvider, useOptionalSuggestions, type SuggestionsValue } from "../hooks/SuggestionsContext";
import { SuggestActions } from "../components/recortes/SuggestActions";
import { recortesMenuItems } from "../shell/menus";
import { useMenuShortcuts } from "../shell/useMenuShortcuts";
import type { NeumeDetectClient, SuggestInput, SuggestResult } from "../lib/neume-detect";
import { resolveCellState } from "../lib/tableUtils";
import type { ManuscriptLine, ManuscriptSource, MocquereauProject, SyllableBox } from "../lib/models";

vi.mock("../lib/suggest/raster", () => ({
  loadSuggestImage: vi.fn(async () => ({})),
  renderSuggestRaster: vi.fn(() => ({ data: new Uint8ClampedArray(10 * 10 * 4), width: 10, height: 10 })),
}));

const BOX = { x: 0.1, y: 0.1, w: 0.2, h: 0.5 };
const IMG = { dataUrl: "data:image/png;base64,iVBORw0KGgo=", width: 100, height: 50, mimeType: "image/png" };

function mkLine(id: string, overrides: Partial<ManuscriptLine> = {}): ManuscriptLine {
  return {
    id,
    image: IMG,
    syllableRange: { start: 0, end: 3 },
    dividers: [],
    gaps: [],
    syllableBoxes: { 0: BOX },
    confirmed: true,
    ...overrides,
  };
}

function mkSource(id: string, lines: ManuscriptLine[]): ManuscriptSource {
  return {
    id,
    order: 1,
    metadata: { siglum: id, library: "", city: "", century: "", classes: [null, null, null] },
    lines,
    syllableCuts: {},
  };
}

// "Puer natus est" → Pu-er na-tus est: 5 syllables.
function projectWith(sources: ManuscriptSource[] = [mkSource("A", [mkLine("line-1")])]): MocquereauProject {
  const base = createNewProject("Introito", "");
  const raw = "Puer natus est";
  return { ...base, text: { raw, words: syllabifyText(raw, "sung"), hyphenationMode: "sung" }, sources };
}

/** Fake neume-detect client: every request waits for the test to settle it. */
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

/** The Recortes menu accelerators, as the App wires them (Ctrl+Shift+G, Ctrl+Shift+Enter). */
function MenuShortcuts() {
  const commands = useRecortesCommands();
  useMenuShortcuts([{ id: "recortes", label: "", items: recortesMenuItems(commands.state, commands, (k) => k) }]);
  return null;
}

/** Real document reducer (with history) around the view. */
function mount(project: MocquereauProject, client: NeumeDetectClient = fakeClient()) {
  const ref: {
    state?: ProjectState;
    dispatch?: React.Dispatch<DocumentAction>;
    history?: HistoryApi;
    recortes?: RecortesContextValue;
    suggestions?: SuggestionsValue | null;
    /** Unmounts/remounts the view (a view switch), keeping the providers. */
    setViewShown?: (shown: boolean) => void;
  } = {};
  function Grab() {
    ref.recortes = useRecortesContext();
    ref.suggestions = useOptionalSuggestions();
    return null;
  }
  function Harness() {
    const [state, dispatch, history] = useProjectReducer();
    const [viewShown, setViewShown] = useState(true);
    Object.assign(ref, { state, dispatch, history, setViewShown });
    if (!state.project) return null;
    return (
      <ProjectContext.Provider value={{ state, dispatch, history }}>
        <RecortesProvider>
          <SuggestionsProvider createClient={() => client}>
            <Grab />
            <MenuShortcuts />
            <div role="toolbar" aria-label="Barra">
              <SuggestActions />
            </div>
            {viewShown && <RecortesView />}
          </SuggestionsProvider>
        </RecortesProvider>
      </ProjectContext.Provider>
    );
  }
  const utils = render(<Harness />);
  act(() => ref.dispatch!({ type: "SET_PROJECT", payload: project }));
  const line = (sourceIdx = 0, lineIdx = 0) => ref.state!.project!.sources[sourceIdx].lines[lineIdx];
  const wrapper = () => utils.container.querySelector("[data-image-wrapper]") as HTMLElement;
  const key = (init: KeyboardEventInit) => act(() => void fireEvent.keyDown(window, init));
  const startHandle = () => utils.getByRole("slider", { name: "Início do intervalo da página" });
  const endHandle = () => utils.getByRole("slider", { name: "Fim do intervalo da página" });
  /** Range shown by the strip's handles. */
  const shownRange = () => [startHandle(), endHandle()].map((h) => h.getAttribute("aria-valuenow"));
  return { ...utils, ref, line, wrapper, key, startHandle, endHandle, shownRange };
}

function pointer(el: Element, type: string, clientX: number, clientY: number, button = 0, init: MouseEventInit = {}) {
  act(() => {
    el.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, clientX, clientY, button, ...init }));
  });
}

const OFFSET_W = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "offsetWidth")!;
const OFFSET_H = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "offsetHeight")!;
const RECT = { left: 0, top: 0, width: 200, height: 100, right: 200, bottom: 100, x: 0, y: 0, toJSON() {} };

beforeEach(() => {
  window.mocquereau = { readClipboardImage: vi.fn(), openImageFile: vi.fn() } as never;
  // jsdom: sem layout nem captura de ponteiro.
  Element.prototype.scrollIntoView = vi.fn();
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue(RECT as DOMRect);
  Object.assign(HTMLElement.prototype, {
    setPointerCapture: vi.fn(),
    releasePointerCapture: vi.fn(),
    hasPointerCapture: vi.fn(() => true),
  });
  Object.defineProperty(HTMLElement.prototype, "offsetWidth", { configurable: true, get: () => 200 });
  Object.defineProperty(HTMLElement.prototype, "offsetHeight", { configurable: true, get: () => 100 });
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  Object.defineProperty(HTMLElement.prototype, "offsetWidth", OFFSET_W);
  Object.defineProperty(HTMLElement.prototype, "offsetHeight", OFFSET_H);
});

describe("RecortesView: o projeto é a fonte única das caixas (D6)", () => {
  it("drawing a box writes to the project immediately on pointer up (no 300 ms delay)", () => {
    vi.useFakeTimers();
    try {
      const v = mount(projectWith());
      v.key({ key: "Tab" }); // sílaba 1, sem caixa
      pointer(v.wrapper(), "pointerdown", 20, 10);
      pointer(v.wrapper(), "pointermove", 60, 60);
      // O rascunho do arraste fica no canvas: nada no projeto ainda.
      expect(v.line().syllableBoxes![1]).toBeUndefined();
      pointer(v.wrapper(), "pointerup", 60, 60);
      const drawn = v.line().syllableBoxes![1]!;
      expect([drawn.x, drawn.y, drawn.w, drawn.h].map((n) => +n.toFixed(9))).toEqual([0.1, 0.1, 0.2, 0.5]);
      expect(v.line().confirmed).toBe(true);
      expect(vi.getTimerCount()).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });

  it("undo after drawing removes the box from the sheet without remounting", () => {
    const v = mount(projectWith());
    const sheet = v.wrapper();
    v.key({ key: "Tab" });
    pointer(sheet, "pointerdown", 20, 10);
    pointer(sheet, "pointermove", 60, 60);
    pointer(sheet, "pointerup", 60, 60);
    expect(sheet.querySelector("[data-box-overlay]")).not.toBeNull();

    act(() => v.ref.dispatch!({ type: "UNDO" }));
    expect(v.wrapper()).toBe(sheet); // mesma folha: não remontou
    expect(sheet.querySelector("[data-box-overlay]")).toBeNull();
    expect(v.line().syllableBoxes![1]).toBeUndefined();

    act(() => v.ref.dispatch!({ type: "REDO" }));
    expect(sheet.querySelector("[data-box-overlay]")).not.toBeNull();
  });

  it("moving a box keeps the draft local and commits once on pointer up", () => {
    const v = mount(projectWith());
    const overlay = v.wrapper().querySelector("[data-box-overlay]") as HTMLElement;
    pointer(overlay, "pointerdown", 30, 30);
    pointer(overlay, "pointermove", 50, 30);
    expect(v.line().syllableBoxes![0]).toEqual(BOX); // projeto intacto durante o arraste
    expect((v.wrapper().querySelector("[data-box-overlay]") as HTMLElement).style.left).toBe("20%");
    pointer(overlay, "pointerup", 50, 30);
    expect(v.line().syllableBoxes![0]!.x).toBeCloseTo(0.2, 9);
    act(() => v.ref.dispatch!({ type: "UNDO" }));
    expect(v.line().syllableBoxes![0]).toEqual(BOX);
    expect(v.ref.history!.canUndo).toBe(false);
  });

  it("a click on the active box without moving is no edit", () => {
    const v = mount(projectWith());
    const overlay = v.wrapper().querySelector("[data-box-overlay]") as HTMLElement;
    pointer(overlay, "pointerdown", 30, 30);
    pointer(overlay, "pointerup", 30, 30);
    expect(v.ref.history!.canUndo).toBe(false);
  });

  it("selection falls back when the active page is removed by undo", async () => {
    const v = mount(projectWith());
    vi.mocked(window.mocquereau.readClipboardImage).mockResolvedValue({ dataUrl: IMG.dataUrl, width: 100, height: 50 });
    await act(async () => {
      window.dispatchEvent(new Event("paste"));
    });
    const lines = v.ref.state!.project!.sources[0].lines;
    expect(lines).toHaveLength(2);
    // Página nova selecionada, com o intervalo sugerido depois da maior sílaba com caixa (0).
    expect(v.shownRange()[0]).toBe("1");

    act(() => v.ref.dispatch!({ type: "UNDO" }));
    expect(v.ref.state!.project!.sources[0].lines).toHaveLength(1);
    expect(v.shownRange()).toEqual(["0", "3"]);
    expect(v.wrapper()).not.toBeNull();
  });

  it("range changes go to the project and keep boxes outside the range", () => {
    const v = mount(projectWith([mkSource("A", [mkLine("line-1", { syllableBoxes: { 0: BOX, 3: BOX } })])]));
    fireEvent.keyDown(v.endHandle(), { key: "ArrowLeft" });
    fireEvent.keyDown(v.endHandle(), { key: "ArrowLeft" });
    expect(v.line().syllableRange).toEqual({ start: 0, end: 1 });
    expect(v.line().syllableBoxes![3]).toEqual(BOX);
  });
});

describe("RecortesView: link da Tabela para sílaba fora do intervalo", () => {
  it("desenhar a caixa estende o intervalo no mesmo passo de desfazer e a célula da Tabela resolve", () => {
    const v = mount(
      projectWith([mkSource("A", [mkLine("line-1", { syllableRange: { start: 0, end: 1 }, syllableBoxes: { 0: BOX } })])]),
    );
    act(() => v.ref.recortes!.goTo({ sourceId: "A", syllable: 3 }));
    expect(v.ref.recortes!.activeSyllable).toBe(3);
    pointer(v.wrapper(), "pointerdown", 20, 10);
    pointer(v.wrapper(), "pointermove", 60, 60);
    pointer(v.wrapper(), "pointerup", 60, 60);
    expect(v.line().syllableRange).toEqual({ start: 0, end: 3 });
    expect(v.line().syllableBoxes![3]).toBeTruthy();
    expect(resolveCellState(v.ref.state!.project!.sources[0], 3).kind).toBe("filled");
    act(() => v.ref.history!.undo());
    expect(v.line().syllableRange).toEqual({ start: 0, end: 1 });
    expect(v.line().syllableBoxes![3]).toBeUndefined();
    expect(v.ref.history!.canUndo).toBe(false);
  });

  it("antes do início também estende (o início recua)", () => {
    const v = mount(
      projectWith([mkSource("A", [mkLine("line-1", { syllableRange: { start: 2, end: 4 }, syllableBoxes: { 2: BOX } })])]),
    );
    act(() => v.ref.recortes!.goTo({ sourceId: "A", syllable: 0 }));
    pointer(v.wrapper(), "pointerdown", 20, 10);
    pointer(v.wrapper(), "pointermove", 60, 60);
    pointer(v.wrapper(), "pointerup", 60, 60);
    expect(v.line().syllableRange).toEqual({ start: 0, end: 4 });
  });
});

describe("RecortesView: só o botão principal edita caixas", () => {
  it("botão direito na folha não desenha caixa", () => {
    const v = mount(projectWith());
    v.key({ key: "Tab" });
    pointer(v.wrapper(), "pointerdown", 20, 10, 2);
    pointer(v.wrapper(), "pointermove", 60, 60, 2);
    pointer(v.wrapper(), "pointerup", 60, 60, 2);
    expect(v.line().syllableBoxes![1]).toBeUndefined();
    expect(v.ref.history!.canUndo).toBe(false);
  });

  it("botão direito na caixa ativa ou numa alça não move nem redimensiona", () => {
    const v = mount(projectWith());
    const overlay = v.wrapper().querySelector("[data-box-overlay]") as HTMLElement;
    pointer(overlay, "pointerdown", 30, 30, 2);
    pointer(overlay, "pointermove", 50, 30, 2);
    pointer(overlay, "pointerup", 50, 30, 2);
    const handle = overlay.querySelector('[data-handle="e"]')!;
    pointer(handle, "pointerdown", 60, 30, 2);
    pointer(overlay, "pointermove", 90, 30, 2);
    pointer(overlay, "pointerup", 90, 30, 2);
    expect(v.line().syllableBoxes![0]).toEqual(BOX);
    expect(v.ref.history!.canUndo).toBe(false);
  });
});

describe("RecortesView: gesto cancelado", () => {
  it("pointercancel no meio do arraste descarta o rascunho da caixa", () => {
    const v = mount(projectWith());
    const overlay = v.wrapper().querySelector("[data-box-overlay]") as HTMLElement;
    pointer(overlay, "pointerdown", 30, 30);
    pointer(overlay, "pointermove", 50, 30);
    expect((v.wrapper().querySelector("[data-box-overlay]") as HTMLElement).style.left).toBe("20%");
    pointer(overlay, "pointercancel", 50, 30);
    expect((v.wrapper().querySelector("[data-box-overlay]") as HTMLElement).style.left).toBe("10%");
    pointer(overlay, "pointerup", 50, 30);
    expect(v.line().syllableBoxes![0]).toEqual(BOX);
    expect(v.ref.history!.canUndo).toBe(false);
  });

  it("pointercancel no meio do desenho descarta a caixa nova", () => {
    const v = mount(projectWith());
    v.key({ key: "Tab" });
    pointer(v.wrapper(), "pointerdown", 20, 10);
    pointer(v.wrapper(), "pointermove", 60, 60);
    pointer(v.wrapper(), "pointercancel", 60, 60);
    pointer(v.wrapper(), "pointerup", 60, 60);
    expect(v.line().syllableBoxes![1]).toBeUndefined();
    expect(v.ref.history!.canUndo).toBe(false);
  });
});

describe("RecortesView: diálogos do provider", () => {
  it("desmontar a vista fecha o diálogo aberto pelo menu Recortes", () => {
    const ref: { recortes?: RecortesContextValue; setShow?: (on: boolean) => void; load?: () => void } = {};
    function Grab() {
      ref.recortes = useRecortesContext();
      return null;
    }
    function Harness() {
      const [state, dispatch, history] = useProjectReducer();
      const [show, setShow] = useState(true);
      ref.setShow = setShow;
      ref.load = () => dispatch({ type: "SET_PROJECT", payload: projectWith() });
      if (!state.project) return null;
      return (
        <ProjectContext.Provider value={{ state, dispatch, history }}>
          <RecortesProvider>
            <SuggestionsProvider>
              <Grab />
              {show && <RecortesView />}
            </SuggestionsProvider>
          </RecortesProvider>
        </ProjectContext.Provider>
      );
    }
    const utils = render(<Harness />);
    act(() => ref.load!());
    act(() => ref.recortes!.setDialog("clearPage"));
    expect(utils.getByRole("dialog", { name: "Limpar esta página?" })).toBeTruthy();
    act(() => ref.setShow!(false));
    expect(ref.recortes!.dialog).toBeNull();
    act(() => ref.setShow!(true));
    expect(utils.queryByRole("dialog")).toBeNull();

    // O mesmo para o diálogo das páginas sem área (S10).
    act(() => {
      ref.recortes!.setSkippedPages({ sourceId: "A", lineIds: ["line-1"] });
      ref.recortes!.setDialog("suggestSkipped");
    });
    expect(utils.getByRole("dialog", { name: "Páginas sem área" })).toBeTruthy();
    act(() => ref.setShow!(false));
    expect(ref.recortes!.dialog).toBeNull();
    expect(ref.recortes!.skippedPages).toBeNull();
  });
});

describe("RecortesView: intervalo de uma sílaba", () => {
  it("{0,0} é mostrado e gravado como está; clicar numa sílaba estende a partir dele", () => {
    const v = mount(projectWith([mkSource("A", [mkLine("line-1", { syllableRange: { start: 0, end: 0 } })])]));
    expect(v.shownRange()).toEqual(["0", "0"]);
    fireEvent.click(v.getByText("na"));
    expect(v.line().syllableRange).toEqual({ start: 0, end: 2 });
  });
});

describe("RecortesView: faixa de sílabas", () => {
  function dragEnd(v: ReturnType<typeof mount>, x: number) {
    act(() => void fireEvent.pointerDown(v.endHandle(), { button: 0 }));
    act(() => void window.dispatchEvent(new MouseEvent("pointermove", { clientX: x })));
    act(() => void window.dispatchEvent(new MouseEvent("pointerup", {})));
  }

  it("arrastes seguidos da alça na mesma página são um passo de desfazer", () => {
    const v = mount(projectWith());
    // Every syllable's centre is at x = 100 (mocked rect): left of it → end at the start.
    dragEnd(v, 50);
    expect(v.line().syllableRange).toEqual({ start: 0, end: 0 });
    dragEnd(v, 150);
    expect(v.line().syllableRange).toEqual({ start: 0, end: 4 });
    act(() => v.ref.dispatch!({ type: "UNDO" }));
    expect(v.line().syllableRange).toEqual({ start: 0, end: 3 });
    expect(v.ref.history!.canUndo).toBe(false);
  });

  it("clique ativa a sílaba; o menu de contexto alterna o gap e remove a caixa no projeto", () => {
    const v = mount(projectWith());
    const syl = (i: number) => v.container.querySelector(`[data-syllable="${i}"]`) as HTMLElement;
    fireEvent.click(syl(2));
    expect(syl(2).className).toContain("italic");
    fireEvent.contextMenu(syl(1));
    fireEvent.click(v.getByRole("menuitemcheckbox", { name: "Sem neuma nesta página" }));
    expect(v.line().gaps).toEqual([1]);
    fireEvent.contextMenu(syl(0));
    fireEvent.click(v.getByRole("menuitem", { name: "Remover caixa" }));
    expect(v.line().syllableBoxes![0]).toBeUndefined();
  });

  it("marcar sem neuma numa sílaba com caixa remove a caixa no mesmo passo de desfazer", () => {
    const v = mount(projectWith());
    const syl = (i: number) => v.container.querySelector(`[data-syllable="${i}"]`) as HTMLElement;
    fireEvent.contextMenu(syl(0));
    fireEvent.click(v.getByRole("menuitemcheckbox", { name: "Sem neuma nesta página" }));
    expect(v.line().gaps).toEqual([0]);
    expect(0 in v.line().syllableBoxes!).toBe(false);
    expect(resolveCellState(v.ref.state!.project!.sources[0], 0).kind).toBe("gap");
    act(() => v.ref.history!.undo());
    expect(v.line().gaps).toEqual([]);
    expect(v.line().syllableBoxes![0]).toEqual(BOX);
    expect(v.ref.history!.canUndo).toBe(false);
  });

  it("Tab numa alça focada move o foco (não é roubado pelo atalho do editor)", () => {
    const v = mount(projectWith());
    const activeIdx = () => v.container.querySelector("[data-syllable].italic")?.getAttribute("data-syllable");
    expect(activeIdx()).toBe("0");
    act(() => v.endHandle().focus());
    const notPrevented = fireEvent.keyDown(v.endHandle(), { key: "Tab" });
    expect(notPrevented).toBe(true);
    expect(activeIdx()).toBe("0");
    // Arrows on the handle are its own: they change the range, not the active box.
    fireEvent.keyDown(v.endHandle(), { key: "ArrowRight" });
    expect(v.line().syllableRange).toEqual({ start: 0, end: 4 });
    expect(v.line().syllableBoxes![0]).toEqual(BOX);
  });

  it("Enter numa sílaba focada da faixa ativa essa sílaba, não avança a do editor", () => {
    const v = mount(projectWith());
    const syl = (i: number) => v.container.querySelector(`[data-syllable="${i}"]`) as HTMLElement;
    act(() => syl(0).focus());
    fireEvent.keyDown(syl(0), { key: "ArrowRight" });
    fireEvent.keyDown(syl(1), { key: "ArrowRight" });
    fireEvent.keyDown(syl(2), { key: "Enter" });
    expect(syl(2).className).toContain("italic");
    expect(v.line().syllableRange).toEqual({ start: 0, end: 3 });
  });

  it("sílabas confirmadas por outra página da fonte ficam inertes", () => {
    const v = mount(
      projectWith([
        mkSource("A", [
          mkLine("a1", { folio: "12r", syllableRange: { start: 0, end: 1 } }),
          mkLine("a2", { syllableRange: { start: 2, end: 4 }, syllableBoxes: {}, confirmed: false }),
        ]),
      ]),
    );
    const syl0 = v.container.querySelector('[data-syllable="0"]') as HTMLElement;
    expect(syl0.className).toContain("cursor-default");
    fireEvent.click(syl0);
    expect(v.line(0, 1).syllableRange).toEqual({ start: 2, end: 4 });
  });
});

describe("RecortesView: atalhos", () => {
  it("Tab/Enter avançam a sílaba e estendem o fim do intervalo; param no fim do texto", () => {
    const v = mount(projectWith());
    for (let i = 0; i < 3; i++) v.key({ key: "Tab" }); // 0 → 3 (fim do intervalo)
    expect(v.line().syllableRange).toEqual({ start: 0, end: 3 });
    v.key({ key: "Enter" }); // 4: além do fim
    expect(v.line().syllableRange).toEqual({ start: 0, end: 4 });
    v.key({ key: "Tab" }); // fim do texto: nada
    expect(v.line().syllableRange).toEqual({ start: 0, end: 4 });
  });

  it("Shift+Tab recua e estende o início do intervalo", () => {
    const v = mount(projectWith([mkSource("A", [mkLine("line-1", { syllableRange: { start: 2, end: 4 }, syllableBoxes: {}, confirmed: false })])]));
    v.key({ key: "Tab", shiftKey: true }); // ativa 2 → 1
    expect(v.line().syllableRange).toEqual({ start: 1, end: 4 });
  });

  it("Ctrl+Enter é do menu Recortes (Próxima fonte): a vista não avança a sílaba", () => {
    const v = mount(projectWith([mkSource("A", [mkLine("a1", { syllableRange: { start: 0, end: 0 } })])]));
    v.key({ key: "Enter", ctrlKey: true });
    expect(v.line().syllableRange).toEqual({ start: 0, end: 0 });
  });

  it("Delete remove a caixa ativa na hora e desconfirma a página vazia", () => {
    const v = mount(projectWith());
    v.key({ key: "Delete" });
    expect(v.line().syllableBoxes![0]).toBeUndefined();
    expect(v.line().confirmed).toBe(false);
    expect(v.wrapper().querySelector("[data-box-overlay]")).toBeNull();
  });

  it("setas movem a caixa ativa (Shift: 10 px) e setas seguidas são um passo de desfazer", () => {
    const v = mount(projectWith());
    v.key({ key: "ArrowRight" });
    v.key({ key: "ArrowRight" });
    v.key({ key: "ArrowDown", shiftKey: true });
    const box = v.line().syllableBoxes![0]!;
    expect(box.x).toBeCloseTo(0.1 + 2 / 200, 9);
    expect(box.y).toBeCloseTo(0.1 + 10 / 100, 9);
    act(() => v.ref.dispatch!({ type: "UNDO" }));
    expect(v.line().syllableBoxes![0]).toEqual(BOX);
    expect(v.ref.history!.canUndo).toBe(false);
  });

  it("setas em outra caixa são outro passo de desfazer", () => {
    const v = mount(projectWith([mkSource("A", [mkLine("line-1", { syllableBoxes: { 0: BOX, 1: BOX } })])]));
    v.key({ key: "ArrowRight" }); // caixa 0
    v.key({ key: "Tab" }); // sílaba 1
    v.key({ key: "ArrowRight" }); // caixa 1
    act(() => v.ref.dispatch!({ type: "UNDO" }));
    expect(v.line().syllableBoxes![1]).toEqual(BOX);
    expect(v.line().syllableBoxes![0]!.x).toBeCloseTo(0.1 + 1 / 200, 9);
    expect(v.ref.history!.canUndo).toBe(true);
  });
});

describe("RecortesView: teclas globais não roubam as da casca", () => {
  it("isOutsideEditorKeys reconhece menus, toolbar, diálogo, abas, árvore, botões e selects", () => {
    document.body.innerHTML = `
      <div role="menubar"><span id="m">Arquivo</span></div>
      <div role="toolbar"><span id="tb">x</span></div>
      <div role="dialog"><span id="d">x</span></div>
      <div role="tablist"><span id="tl">x</span></div>
      <div role="menu"><div id="mi">x</div></div>
      <div role="tree"><div role="treeitem" id="ti">x</div></div>
      <div role="slider" id="sl" tabindex="0"></div>
      <button id="b">ok</button><select id="s"></select>
      <div role="button" data-box-tabstop id="bx" tabindex="0"></div>
      <div id="canvas"></div>`;
    for (const id of ["m", "tb", "d", "tl", "mi", "ti", "sl", "b", "s", "bx"]) {
      expect(isOutsideEditorKeys(document.getElementById(id)!)).toBe(true);
    }
    expect(isOutsideEditorKeys(document.getElementById("canvas")!)).toBe(false);
    document.body.innerHTML = "";
  });

  it("Tab numa caixa não ativa focada segue o foco (sem armadilha); Enter a ativa", () => {
    const v = mount(projectWith([mkSource("A", [mkLine("line-1", { syllableBoxes: { 0: BOX, 2: BOX } })])]));
    const other = v.container.querySelector("[data-box-tabstop]") as HTMLElement;
    expect(other.getAttribute("role")).toBe("button");
    expect(other.getAttribute("aria-label")).toContain("na");
    other.focus();
    const tab = new KeyboardEvent("keydown", { key: "Tab", bubbles: true, cancelable: true });
    act(() => void other.dispatchEvent(tab));
    expect(tab.defaultPrevented).toBe(false);
    expect(v.ref.recortes!.activeSyllable).toBe(0);
    fireEvent.keyDown(other, { key: "Enter" });
    expect(v.ref.recortes!.activeSyllable).toBe(2);
  });

  it.each([
    ["item de menu", () => { const m = document.createElement("div"); m.setAttribute("role", "menu"); const i = document.createElement("div"); i.setAttribute("role", "menuitem"); m.appendChild(i); return i; }],
    ["botão focado", () => document.createElement("button")],
  ])("Delete num %s não apaga a caixa ativa", (_label, make) => {
    const v = mount(projectWith());
    const el = make();
    document.body.appendChild(el.closest("[role=menu]") ?? el);
    act(() => {
      fireEvent.keyDown(el, { key: "Delete" });
      fireEvent.keyDown(el, { key: "ArrowRight" });
    });
    expect(v.line().syllableBoxes![0]).toEqual(BOX);
    expect(v.ref.history!.canUndo).toBe(false);
    (el.closest("[role=menu]") ?? el).remove();
  });
});

describe("RecortesView: largura presa à vista", () => {
  // Regressão do zoom em Recortes: sem min-width:0 o editor cresce até o
  // min-content da faixa de sílabas e o zoom só amplia o canto da imagem.
  // jsdom não faz layout: este teste guarda a classe.
  it("a área do editor encolhe no flex em linha (min-w-0)", () => {
    const state = { ...initialStateForTest, project: projectWith() };
    const { container } = render(
      <ProjectContext.Provider value={{ state, dispatch: vi.fn() }}>
        <RecortesProvider>
          <SuggestionsProvider>
            <div className="flex">
              <RecortesView />
            </div>
          </SuggestionsProvider>
        </RecortesProvider>
      </ProjectContext.Provider>,
    );
    const root = (container.firstChild as HTMLElement).firstChild as HTMLElement;
    const editor = root.firstChild as HTMLElement;
    expect(editor.className.split(/\s+/)).toContain("min-w-0");
  });
});

describe("RecortesView: diálogo Fonte", () => {
  it("'Nova fonte' cria a fonte e abre o diálogo Fonte para ela; editar grava ao vivo", () => {
    const { ref, getByRole, queryByRole } = mount(projectWith());
    fireEvent.click(getByRole("button", { name: "Nova fonte" }));
    const sources = ref.state!.project!.sources;
    expect(sources).toHaveLength(2);
    const siglum = getByRole("textbox", { name: "Sigla" });
    fireEvent.change(siglum, { target: { value: "Ein 121" } });
    expect(ref.state!.project!.sources[1].metadata.siglum).toBe("Ein 121");
    fireEvent.click(getByRole("button", { name: "Concluído" }));
    expect(queryByRole("dialog")).toBeNull();
  });

  it("duplo clique numa fonte abre o diálogo dela", () => {
    const { getByRole, container } = mount(projectWith());
    fireEvent.doubleClick(container.querySelector('[data-source-id="A"]')!);
    expect((getByRole("textbox", { name: "Sigla" }) as HTMLInputElement).value).toBe("A");
  });
});

describe("RecortesView: menu Recortes na folha (menu de contexto)", () => {
  function openSheetMenu(v: ReturnType<typeof mount>) {
    fireEvent.contextMenu(v.wrapper(), { clientX: 20, clientY: 20 });
    return v.getByRole("menu", { name: "Recortes" });
  }

  it("mostra os itens do menu Recortes; Remover caixa remove a caixa ativa", () => {
    const v = mount(projectWith());
    const menu = openSheetMenu(v);
    expect(within(menu).getAllByRole("menuitem").map((i) => i.textContent)).toEqual([
      "Remover caixaDelete",
      "Limpar página…",
      "Realinhar caixas…",
      "Próxima fonteCtrl+Enter",
    ]);
    fireEvent.click(within(menu).getByRole("menuitem", { name: /Remover caixa/ }));
    expect(v.line().syllableBoxes![0]).toBeUndefined();
    expect(v.queryByRole("menu")).toBeNull();
  });

  it("tecla Menu ou Shift+F10 abrem o menu da folha no centro da caixa ativa", () => {
    const v = mount(projectWith());
    v.key({ key: "ContextMenu" });
    const menu = v.getByRole("menu", { name: "Recortes" });
    expect([menu.style.left, menu.style.top]).toEqual(["100px", "50px"]);
    fireEvent.keyDown(document.activeElement!, { key: "Escape" });
    expect(v.queryByRole("menu")).toBeNull();
    v.key({ key: "F10", shiftKey: true });
    expect(v.getByRole("menu", { name: "Recortes" })).toBeTruthy();
  });

  it("sem caixa ativa, o menu da folha abre no centro da folha", () => {
    const v = mount(projectWith());
    v.key({ key: "Tab" }); // sílaba 1, sem caixa
    v.key({ key: "F10", shiftKey: true });
    const menu = v.getByRole("menu", { name: "Recortes" });
    expect([menu.style.left, menu.style.top]).toEqual(["100px", "50px"]);
    expect(within(menu).getByRole("menuitem", { name: /Remover caixa/ }).hasAttribute("disabled")).toBe(true);
  });

  it("Limpar página… pede confirmação e limpa só a página ativa (caixas, gaps e recortes do intervalo)", () => {
    const src = mkSource("A", [
      mkLine("a1", { syllableRange: { start: 0, end: 1 }, gaps: [1], syllableBoxes: { 0: BOX } }),
      mkLine("a2", { syllableRange: { start: 2, end: 4 }, syllableBoxes: { 2: BOX } }),
    ]);
    src.syllableCuts = { 0: { dataUrl: "x" }, 3: { dataUrl: "y" } } as never;
    const v = mount(projectWith([src]));
    fireEvent.click(within(openSheetMenu(v)).getByRole("menuitem", { name: "Limpar página…" }));
    const dialog = v.getByRole("dialog", { name: "Limpar esta página?" });
    fireEvent.click(within(dialog).getByRole("button", { name: "Cancelar" }));
    expect(v.line(0, 0).syllableBoxes).toEqual({ 0: BOX });

    fireEvent.click(within(openSheetMenu(v)).getByRole("menuitem", { name: "Limpar página…" }));
    fireEvent.click(within(v.getByRole("dialog")).getByRole("button", { name: "Limpar" }));
    expect(v.line(0, 0)).toMatchObject({ syllableBoxes: {}, gaps: [], confirmed: false });
    expect(v.line(0, 1).syllableBoxes).toEqual({ 2: BOX });
    expect(v.line(0, 1).confirmed).toBe(true);
    expect(Object.keys(v.ref.state!.project!.sources[0].syllableCuts)).toEqual(["3"]);
    act(() => v.ref.history!.undo());
    expect(v.line(0, 0).syllableBoxes).toEqual({ 0: BOX });
  });

  it("Realinhar caixas… abre o diálogo; Próxima fonte vai à fonte seguinte", () => {
    const v = mount(
      projectWith([
        mkSource("A", [mkLine("a1")]),
        mkSource("B", [mkLine("b1", { syllableRange: { start: 1, end: 2 }, confirmed: false, syllableBoxes: {} })]),
      ]),
    );
    fireEvent.click(within(openSheetMenu(v)).getByRole("menuitem", { name: "Realinhar caixas…" }));
    expect(v.getByRole("dialog", { name: /Realinhar/ })).toBeTruthy();
    fireEvent.click(within(v.getByRole("dialog")).getByRole("button", { name: "Cancelar" }));
    fireEvent.click(within(openSheetMenu(v)).getByRole("menuitem", { name: /Próxima fonte/ }));
    expect(v.shownRange()).toEqual(["1", "2"]);
    // Na última fonte, sem caixas: Remover, Limpar, Realinhar e Próxima ficam desabilitados.
    const items = within(openSheetMenu(v)).getAllByRole("menuitem") as HTMLButtonElement[];
    expect(items.map((i) => i.disabled)).toEqual([true, true, true, true]);
  });

  it("a barra antiga (sigla, Ajustes, Limpar tudo) saiu da vista", () => {
    const v = mount(projectWith());
    expect(v.queryByText("Alterações salvas automaticamente")).toBeNull();
    expect(v.queryByRole("button", { name: /Limpar tudo|Ajustes/ })).toBeNull();
  });
});

describe("RecortesView: sugestões de neumas (S3, S6, S10)", () => {
  const B0: SyllableBox = { x: 0.05, y: 0.2, w: 0.1, h: 0.2 };
  const B1: SyllableBox = { x: 0.25, y: 0.2, w: 0.1, h: 0.2 };
  const B2: SyllableBox = { x: 0.45, y: 0.2, w: 0.1, h: 0.2 };

  function result(boxes: Record<number, SyllableBox>, needsBand = false): SuggestResult {
    return {
      suggestions: Object.entries(boxes).map(([i, box]) => ({ index: Number(i), box, confidence: 0.9 })),
      debug: { needsBand } as SuggestResult["debug"],
    };
  }

  const blank = (id: string) => mkLine(id, { syllableRange: { start: 0, end: 4 }, syllableBoxes: {}, confirmed: false });

  async function mountOn(lines: ManuscriptLine[] = [blank("line-1")]) {
    window.mocquereau = {
      readClipboardImage: vi.fn(),
      openImageFile: vi.fn(),
      getSuggestionsEnabled: vi.fn(async () => true),
      setSuggestionsEnabled: vi.fn(async (on: boolean) => on),
    } as never;
    const client = fakeClient();
    const v = mount(projectWith([mkSource("A", lines)]), client);
    await act(async () => {}); // preference
    const suggested = () => Array.from(v.container.querySelectorAll<HTMLElement>(".sc-box--suggested"));
    const resolve = async (n: number, r: SuggestResult) => {
      await waitFor(() => expect(client.calls.length).toBe(n + 1));
      await act(async () => {
        client.calls[n].resolve(r);
        await Promise.resolve();
      });
    };
    /** Ctrl+Shift+G (menu accelerator) and the first result. */
    const suggestWith = async (boxes: Record<number, SyllableBox>) => {
      const n = client.calls.length;
      v.key({ key: "G", ctrlKey: true, shiftKey: true });
      await resolve(n, result(boxes));
    };
    return { ...v, client, suggested, resolve, suggestWith };
  }

  it("Sugerir mostra caixas tracejadas; Enter aceita a ativa e avança; Ctrl+Z desfaz", async () => {
    const v = await mountOn();
    await v.suggestWith({ 0: B0, 1: B1, 2: B2 });
    expect(v.suggested()).toHaveLength(3);
    // A sugestão da sílaba ativa leva a etiqueta.
    expect(v.suggested().filter((el) => el.querySelector(".sc-box__tag")).map((el) => el.textContent)).toEqual(["Pu"]);
    expect(v.ref.recortes!.activeSyllable).toBe(0);

    v.key({ key: "Enter" });
    expect(v.line().syllableBoxes).toEqual({ 0: B0 });
    expect(v.ref.recortes!.activeSyllable).toBe(1);
    expect(v.suggested()).toHaveLength(2);

    // Tab avança sem aceitar.
    v.key({ key: "Tab" });
    expect(v.ref.recortes!.activeSyllable).toBe(2);
    expect(v.line().syllableBoxes).toEqual({ 0: B0 });

    act(() => v.ref.history!.undo());
    expect(v.line().syllableBoxes).toEqual({});
  });

  it("clique sem arrastar dentro de uma sugestão ativa a sílaba dela, sem aceitar nem desenhar", async () => {
    const v = await mountOn();
    await v.suggestWith({ 0: B0, 2: B2 });
    expect(v.suggested().every((el) => el.className.includes("pointer-events-none"))).toBe(true);
    // B2 ocupa x 90-110, y 20-40 na folha de 200 x 100.
    pointer(v.wrapper(), "pointerdown", 100, 30);
    pointer(v.wrapper(), "pointerup", 100, 30);
    expect(v.ref.recortes!.activeSyllable).toBe(2);
    expect(v.line().syllableBoxes).toEqual({});
  });

  it("arrastar a partir de dentro da sugestão de outra sílaba desenha a caixa da ativa", async () => {
    const v = await mountOn();
    await v.suggestWith({ 0: B0, 2: B2 });
    expect(v.ref.recortes!.activeSyllable).toBe(0);
    // Nenhuma sugestão recebe o ponteiro: o gesto começa na folha.
    expect(v.suggested().every((el) => el.className.includes("pointer-events-none"))).toBe(true);
    pointer(v.wrapper(), "pointerdown", 100, 30);
    pointer(v.wrapper(), "pointermove", 140, 80);
    pointer(v.wrapper(), "pointerup", 140, 80);
    expect(v.ref.recortes!.activeSyllable).toBe(0);
    const drawn = v.line().syllableBoxes![0]!;
    expect([drawn.x, drawn.y, drawn.w, drawn.h].map((n) => +n.toFixed(9))).toEqual([0.5, 0.3, 0.2, 0.5]);
  });

  it("Ctrl+Shift+Enter aceita todas num passo, sem avançar a sílaba", async () => {
    const v = await mountOn();
    await v.suggestWith({ 0: B0, 1: B1, 2: B2 });
    v.key({ key: "Enter", ctrlKey: true, shiftKey: true });
    expect(v.line().syllableBoxes).toEqual({ 0: B0, 1: B1, 2: B2 });
    expect(v.ref.recortes!.activeSyllable).toBe(0);
    expect(v.suggested()).toHaveLength(0);
    act(() => v.ref.history!.undo());
    expect(v.line().syllableBoxes).toEqual({});
  });

  it("Delete numa sílaba sugerida rejeita a sugestão sem criar caixa", async () => {
    const v = await mountOn();
    await v.suggestWith({ 0: B0, 1: B1 });
    v.key({ key: "Delete" });
    expect(v.suggested()).toHaveLength(1);
    expect(v.line().syllableBoxes).toEqual({});
    expect(v.ref.history!.canUndo).toBe(false);
  });

  it("Esc descarta as sugestões da página", async () => {
    const v = await mountOn();
    await v.suggestWith({ 0: B0, 1: B1 });
    v.key({ key: "Escape" });
    expect(v.suggested()).toHaveLength(0);
    expect(v.line().syllableBoxes).toEqual({});
  });

  it("faixa de sílabas: sugerida sem caixa ganha traço tracejado", async () => {
    const v = await mountOn();
    await v.suggestWith({ 1: B1 });
    const underline = v.container.querySelector('[data-syllable="1"] [data-underline]')!;
    expect(underline.className).toContain("border-dashed");
  });

  it("dica de uma linha: Nenhum neuma encontrado, some na próxima tecla", async () => {
    const v = await mountOn();
    await v.suggestWith({});
    expect(v.getByText("Nenhum neuma encontrado").className).toContain("text-ink-muted");
    v.key({ key: "Tab" });
    expect(v.queryByText("Nenhum neuma encontrado")).toBeNull();
    // Sugerir de novo sem nada achado: a linha volta.
    await v.suggestWith({});
    expect(v.getByText("Nenhum neuma encontrado")).toBeTruthy();
  });

  it("nada a sugerir (todas com caixa): sem dica e sem pedido ao detector", async () => {
    const full = { 0: BOX, 1: BOX, 2: BOX, 3: BOX, 4: BOX };
    const v = await mountOn([mkLine("p1", { syllableRange: { start: 0, end: 4 }, syllableBoxes: full })]);
    v.key({ key: "G", ctrlKey: true, shiftKey: true });
    await act(async () => {});
    expect(v.queryByRole("status")).toBeNull();
    expect(v.client.calls).toHaveLength(0);
  });

  it("clicar em Sugerir entrega o foco à folha: Enter aceita a sugestão ativa e não pede de novo", async () => {
    const v = await mountOn();
    const button = v.getByRole("button", { name: "Sugerir" });
    act(() => button.focus());
    fireEvent.click(button);
    expect(document.activeElement).toBe(v.container.querySelector("[data-recortes-sheet]"));
    await v.resolve(0, result({ 0: B0, 1: B1 }));
    act(() => void fireEvent.keyDown(document.activeElement!, { key: "Enter" }));
    expect(v.line().syllableBoxes).toEqual({ 0: B0 });
    expect(v.ref.recortes!.activeSyllable).toBe(1);
    await act(async () => {});
    expect(v.client.calls).toHaveLength(1);
    // Aceitar N also hands focus back: Delete then rejects the active suggestion.
    const accept = v.getByRole("button", { name: /Aceitar/ });
    act(() => accept.focus());
    fireEvent.click(accept);
    expect(document.activeElement).toBe(v.container.querySelector("[data-recortes-sheet]"));
  });

  it("fim do pedido com o foco preso na barra: o foco vai à folha", async () => {
    const v = await mountOn();
    v.key({ key: "G", ctrlKey: true, shiftKey: true });
    const button = v.getByRole("button", { name: "Cancelar" });
    act(() => button.focus());
    await v.resolve(0, result({ 0: B0 }));
    expect(document.activeElement).toBe(v.container.querySelector("[data-recortes-sheet]"));
  });

  it("clicar numa página da árvore entrega o foco à folha: Enter aceita; setas na árvore seguem nela", async () => {
    const v = await mountOn([blank("p1"), blank("p2")]);
    act(() => v.ref.recortes!.selectLine("A", "p1"));
    await v.suggestWith({ 0: B0, 1: B1 });
    act(() => v.ref.recortes!.selectLine("A", "p2"));
    const tree = v.getByRole("tree");
    const items = within(tree).getAllByRole("treeitem").filter((el) => el.hasAttribute("data-line-id"));
    const p1 = items.find((el) => el.getAttribute("data-line-id") === "p1")!;
    // Keyboard in the tree stays in the tree.
    act(() => p1.focus());
    act(() => void fireEvent.keyDown(p1, { key: "ArrowDown" }));
    expect(tree.contains(document.activeElement)).toBe(true);
    // A mouse pick hands focus to the sheet.
    act(() => p1.focus());
    fireEvent.click(p1);
    expect(v.ref.recortes!.activeLineId).toBe("p1");
    expect(document.activeElement).toBe(v.container.querySelector("[data-recortes-sheet]"));
    act(() => void fireEvent.keyDown(document.activeElement!, { key: "Enter" }));
    expect(v.line(0, 0).syllableBoxes).toEqual({ 0: B0 });
  });

  it("Enter que aceita no fim do intervalo não estende o intervalo (um passo de desfazer)", async () => {
    const v = await mountOn([mkLine("p1", { syllableRange: { start: 0, end: 1 }, syllableBoxes: {}, confirmed: false })]);
    await v.suggestWith({ 0: B0, 1: B1 });
    v.key({ key: "Tab" });
    expect(v.ref.recortes!.activeSyllable).toBe(1);
    v.key({ key: "Enter" });
    expect(v.line().syllableBoxes).toEqual({ 1: B1 });
    expect(v.line().syllableRange).toEqual({ start: 0, end: 1 });
    expect(v.suggested()).toHaveLength(1); // the page's other suggestion survives
    act(() => v.ref.history!.undo());
    expect(v.line().syllableBoxes).toEqual({});
    expect(v.ref.history!.canUndo).toBe(false);
  });

  it("Sugerir em todas as páginas: em outra página o botão é Cancelar e cancela as páginas restantes", async () => {
    const v = await mountOn([blank("p1"), blank("p2"), blank("p3")]);
    fireEvent.contextMenu(v.wrapper(), { clientX: 20, clientY: 20 });
    fireEvent.click(within(v.getByRole("menu", { name: "Recortes" })).getByRole("menuitem", { name: "Sugerir em todas as páginas da fonte" }));
    await v.resolve(0, result({ 0: B0 }));
    await waitFor(() => expect(v.client.calls.length).toBe(2));
    act(() => v.ref.recortes!.selectLine("A", "p3"));
    fireEvent.click(v.getByRole("button", { name: "Cancelar" }));
    expect(v.getByRole("button", { name: "Sugerir" })).toBeTruthy();
    await act(async () => {
      v.client.calls[1].resolve(result({ 1: B1 }));
      await Promise.resolve();
    });
    await act(async () => {});
    expect(v.client.calls).toHaveLength(2);
    expect(v.queryByRole("dialog")).toBeNull();
  });

  it("fonte inteira terminada depois de sair da vista: o diálogo não abre na volta", async () => {
    const v = await mountOn([blank("p1"), blank("p2")]);
    fireEvent.contextMenu(v.wrapper(), { clientX: 20, clientY: 20 });
    fireEvent.click(within(v.getByRole("menu", { name: "Recortes" })).getByRole("menuitem", { name: "Sugerir em todas as páginas da fonte" }));
    await v.resolve(0, result({}, true));
    await waitFor(() => expect(v.client.calls.length).toBe(2));
    act(() => v.ref.setViewShown!(false));
    await act(async () => {
      v.client.calls[1].resolve(result({}, true));
      await Promise.resolve();
    });
    await act(async () => {});
    act(() => v.ref.setViewShown!(true));
    expect(v.queryByRole("dialog")).toBeNull();
  });

  it("Sugerir em todas as páginas: páginas sem área abrem o diálogo; Ir para a primeira a seleciona", async () => {
    const v = await mountOn([blank("p1"), blank("p2"), blank("p3")]);
    fireEvent.contextMenu(v.wrapper(), { clientX: 20, clientY: 20 });
    fireEvent.click(within(v.getByRole("menu", { name: "Recortes" })).getByRole("menuitem", { name: "Sugerir em todas as páginas da fonte" }));
    await v.resolve(0, result({ 0: B0 }));
    await v.resolve(1, result({}, true));
    await v.resolve(2, result({}, true));
    const dialog = await waitFor(() => v.getByRole("dialog", { name: "Páginas sem área" }));
    expect(dialog.textContent).toContain("2 páginas precisam da área da linha de neumas.");
    fireEvent.click(within(dialog).getByRole("button", { name: "Ir para a primeira" }));
    expect(v.queryByRole("dialog")).toBeNull();
    expect(v.ref.recortes!.activeLineId).toBe("p2");
    expect(v.ref.recortes!.bandTool).toBe(true);
  });

  it("needsBand liga a ferramenta só uma vez: Esc, voltar à página ou remontar a vista não a religam", async () => {
    window.mocquereau = {
      readClipboardImage: vi.fn(),
      openImageFile: vi.fn(),
      getSuggestionsEnabled: vi.fn(async () => true),
      setSuggestionsEnabled: vi.fn(async (on: boolean) => on),
    } as never;
    const client = fakeClient();
    const blank = (id: string) => mkLine(id, { syllableRange: { start: 0, end: 4 }, syllableBoxes: {}, confirmed: false });
    const v = mount(projectWith([mkSource("A", [blank("p1"), blank("p2")])]), client);
    await act(async () => {});
    act(() => v.ref.recortes!.selectLine("A", "p1"));
    v.key({ key: "G", ctrlKey: true, shiftKey: true });
    await waitFor(() => expect(client.calls.length).toBe(1));
    await act(async () => {
      client.calls[0].resolve({ suggestions: [], debug: { needsBand: true } as SuggestResult["debug"] });
      await Promise.resolve();
    });
    expect(v.ref.recortes!.bandTool).toBe(true);
    v.key({ key: "Escape" });
    expect(v.ref.recortes!.bandTool).toBe(false);
    act(() => v.ref.recortes!.selectLine("A", "p2"));
    act(() => v.ref.recortes!.selectLine("A", "p1"));
    expect(v.ref.recortes!.bandTool).toBe(false);
    act(() => v.ref.setViewShown!(false));
    act(() => v.ref.setViewShown!(true));
    expect(v.ref.recortes!.bandTool).toBe(false);
  });

  it("gravar uma área na página apaga a dica needsBand dela", async () => {
    window.mocquereau = {
      readClipboardImage: vi.fn(),
      openImageFile: vi.fn(),
      getSuggestionsEnabled: vi.fn(async () => true),
      setSuggestionsEnabled: vi.fn(async (on: boolean) => on),
    } as never;
    const client = fakeClient();
    const blank = mkLine("line-1", { syllableRange: { start: 0, end: 4 }, syllableBoxes: {}, confirmed: false });
    const v = mount(projectWith([mkSource("A", [blank])]), client);
    await act(async () => {});
    v.key({ key: "G", ctrlKey: true, shiftKey: true });
    await waitFor(() => expect(client.calls.length).toBe(1));
    await act(async () => {
      client.calls[0].resolve({ suggestions: [], debug: { needsBand: true } as SuggestResult["debug"] });
      await Promise.resolve();
    });
    expect(v.getByRole("status")).toBeTruthy();
    pointer(v.wrapper(), "pointerdown", 20, 20);
    pointer(v.wrapper(), "pointermove", 180, 40);
    pointer(v.wrapper(), "pointerup", 180, 40);
    expect(v.line().neumeBands).toHaveLength(1);
    expect(v.queryByRole("status")).toBeNull();
    // The hint is gone from the provider too: remounting the view does not bring it back.
    act(() => v.ref.setViewShown!(false));
    act(() => v.ref.setViewShown!(true));
    expect(v.queryByRole("status")).toBeNull();
  });

  it("ferramenta desligada: Delete não apaga a área que estava selecionada", () => {
    const TOP = { x: 0.1, y: 0.1, w: 0.8, h: 0.1 };
    const LOW = { x: 0.1, y: 0.6, w: 0.8, h: 0.1 };
    const v = mount(projectWith([mkSource("A", [mkLine("line-1", { neumeBands: [TOP, LOW] })])]));
    act(() => v.ref.recortes!.setBandTool(true));
    act(() => v.ref.recortes!.setActiveBand(1));
    act(() => v.ref.recortes!.setBandTool(false));
    // Even if a late gesture selects a band while the tool is off.
    act(() => v.ref.recortes!.setActiveBand(1));
    expect(v.ref.recortes!.activeBand).toBeNull();
    v.key({ key: "Delete" });
    expect(v.line().neumeBands).toEqual([TOP, LOW]);
  });

  describe("RecortesView: modo candidatos (M3)", () => {
    const C0: SyllableBox = { x: 0.05, y: 0.2, w: 0.1, h: 0.2 };
    const C1: SyllableBox = { x: 0.25, y: 0.2, w: 0.1, h: 0.2 };
    const C2: SyllableBox = { x: 0.45, y: 0.2, w: 0.1, h: 0.2 };
    const cands = (boxes: SyllableBox[], bands = boxes.map(() => 0)): SuggestResult =>
      ({ suggestions: [], candidates: boxes.map((box, i) => ({ box, band: bands[i] })), debug: { needsBand: false } as SuggestResult["debug"] });
    const shown = (v: Awaited<ReturnType<typeof mountOn>>) => v.container.querySelectorAll("[data-candidate]").length;

    async function candidatesOn(lines?: ManuscriptLine[]) {
      const v = await mountOn(lines);
      act(() => v.ref.suggestions!.setMode("candidates"));
      const n = v.client.calls.length;
      v.key({ key: "G", ctrlKey: true, shiftKey: true });
      await v.resolve(n, cands([C0, C1, C2]));
      return v;
    }

    it("Sugerir mostra os candidatos neutros, sem sugestões nem Aceitar N", async () => {
      const v = await candidatesOn();
      expect(shown(v)).toBe(3);
      expect(v.suggested()).toHaveLength(0);
      expect(v.queryByRole("button", { name: /Aceitar/ })).toBeNull();
      const el = v.container.querySelector<HTMLElement>("[data-candidate]")!;
      expect(el.className).toContain("border-rule-strong");
      expect(el.textContent).toBe("");
    });

    it("clique: vira a caixa da ativa, a ativa avança, o candidato some; Ctrl+Z desfaz num passo", async () => {
      const v = await candidatesOn();
      pointer(v.wrapper(), "pointerdown", 60, 30); // dentro de C1 (x 50-70)
      pointer(v.wrapper(), "pointerup", 60, 30);
      expect(v.line().syllableBoxes).toEqual({ 0: C1 });
      expect(v.ref.recortes!.activeSyllable).toBe(1);
      expect(shown(v)).toBe(2);
      act(() => v.ref.history!.undo());
      expect(v.line().syllableBoxes).toEqual({});
      expect(shown(v)).toBe(3);
    });

    it("Shift+clique une à caixa da ativa sem avançar", async () => {
      const v = await candidatesOn();
      pointer(v.wrapper(), "pointerdown", 20, 30, 0, { shiftKey: true }); // C0
      pointer(v.wrapper(), "pointerup", 20, 30, 0, { shiftKey: true });
      pointer(v.wrapper(), "pointerdown", 60, 30, 0, { shiftKey: true }); // C1
      pointer(v.wrapper(), "pointerup", 60, 30, 0, { shiftKey: true });
      const b = v.line().syllableBoxes![0]!;
      expect([b.x, b.y, b.w, b.h].map((n) => +n.toFixed(9))).toEqual([0.05, 0.2, 0.3, 0.2]);
      expect(v.ref.recortes!.activeSyllable).toBe(0);
      expect(shown(v)).toBe(1);
    });

    it("Enter: primeiro candidato, depois o seguinte à caixa anterior; avança a cada vez", async () => {
      const v = await candidatesOn();
      v.key({ key: "Enter" });
      expect(v.line().syllableBoxes).toEqual({ 0: C0 });
      v.key({ key: "Enter" });
      expect(v.line().syllableBoxes).toEqual({ 0: C0, 1: C1 });
      expect(v.ref.recortes!.activeSyllable).toBe(2);
    });

    it("Enter no fim da área passa ao primeiro candidato da área seguinte", async () => {
      const bands = [{ x: 0, y: 0, w: 1, h: 0.5 }, { x: 0, y: 0.5, w: 1, h: 0.5 }];
      const v = await mountOn([mkLine("line-1", { syllableRange: { start: 0, end: 4 }, syllableBoxes: {}, confirmed: false, neumeBands: bands })]);
      act(() => v.ref.suggestions!.setMode("candidates"));
      v.key({ key: "G", ctrlKey: true, shiftKey: true });
      const D0 = { x: 0.05, y: 0.6, w: 0.1, h: 0.2 };
      await v.resolve(0, cands([C0, D0], [0, 1]));
      v.key({ key: "Enter" });
      v.key({ key: "Enter" });
      expect(v.line().syllableBoxes).toEqual({ 0: C0, 1: D0 });
    });

    it("Enter depois de uma sílaba sem neuma usa a última caixa real antes dela", async () => {
      const v = await candidatesOn([mkLine("line-1", { syllableRange: { start: 0, end: 4 }, syllableBoxes: { 0: C1, 1: null }, confirmed: true })]);
      act(() => v.ref.recortes!.setActiveSyllable(2));
      v.key({ key: "Enter" });
      expect(v.line().syllableBoxes).toEqual({ 0: C1, 1: null, 2: C2 });
    });

    it("Shift+clique num candidato de outra área não une", async () => {
      const bands = [{ x: 0, y: 0, w: 1, h: 0.5 }, { x: 0, y: 0.5, w: 1, h: 0.5 }];
      const v = await mountOn([mkLine("line-1", { syllableRange: { start: 0, end: 4 }, syllableBoxes: { 0: C0 }, confirmed: true, neumeBands: bands })]);
      act(() => v.ref.suggestions!.setMode("candidates"));
      v.key({ key: "G", ctrlKey: true, shiftKey: true });
      const D0 = { x: 0.25, y: 0.6, w: 0.1, h: 0.2 };
      await v.resolve(0, cands([C1, D0], [0, 1]));
      pointer(v.wrapper(), "pointerdown", 60, 70, 0, { shiftKey: true }); // D0, área 1
      pointer(v.wrapper(), "pointerup", 60, 70, 0, { shiftKey: true });
      expect(v.line().syllableBoxes).toEqual({ 0: C0 });
      expect(v.ref.recortes!.activeSyllable).toBe(0);
      pointer(v.wrapper(), "pointerdown", 60, 30, 0, { shiftKey: true }); // C1, mesma área
      pointer(v.wrapper(), "pointerup", 60, 30, 0, { shiftKey: true });
      const b = v.line().syllableBoxes![0]!;
      expect([b.x, b.w].map((n) => +n.toFixed(9))).toEqual([0.05, 0.3]);
    });

    it("Esc descarta os candidatos da página", async () => {
      const v = await candidatesOn();
      v.key({ key: "Escape" });
      expect(shown(v)).toBe(0);
    });

    it("clique no último do intervalo fica; Enter com caixa só avança", async () => {
      const v = await candidatesOn([mkLine("line-1", { syllableRange: { start: 0, end: 1 }, syllableBoxes: { 0: BOX }, confirmed: true })]);
      v.key({ key: "Enter" }); // ativa 0 já tem caixa: só avança
      expect(v.line().syllableBoxes).toEqual({ 0: BOX });
      expect(v.ref.recortes!.activeSyllable).toBe(1);
      pointer(v.wrapper(), "pointerdown", 100, 30); // C2
      pointer(v.wrapper(), "pointerup", 100, 30);
      expect(v.line().syllableBoxes).toEqual({ 0: BOX, 1: C2 });
      expect(v.ref.recortes!.activeSyllable).toBe(1);
      expect(v.line().syllableRange).toEqual({ start: 0, end: 1 });
      expect(v.ref.state!.isDirty).toBe(true); // the box is a real edit; the candidates are not
    });
  });

});

describe("RecortesView: áreas da linha de neumas (S7)", () => {
  const TOP = { x: 0.1, y: 0.1, w: 0.8, h: 0.1 };
  const LOW = { x: 0.1, y: 0.6, w: 0.8, h: 0.1 };

  it("Delete com área selecionada remove só ela (antes da caixa ativa); Esc desliga a ferramenta", () => {
    const v = mount(projectWith([mkSource("A", [mkLine("line-1", { neumeBands: [TOP, LOW] })])]));
    act(() => v.ref.recortes!.setBandTool(true));
    // LOW ocupa y 60-70 na folha de 200 x 100.
    const low = v.container.querySelector('[data-neume-band="1"]') as HTMLElement;
    pointer(low, "pointerdown", 100, 65);
    pointer(low, "pointerup", 100, 65);
    expect(v.ref.recortes!.activeBand).toBe(1);
    v.key({ key: "Delete" });
    expect(v.line().neumeBands).toEqual([TOP]);
    expect(v.line().syllableBoxes).toEqual({ 0: BOX });
    v.key({ key: "Escape" });
    expect(v.ref.recortes!.bandTool).toBe(false);
    act(() => v.ref.history!.undo());
    expect(v.line().neumeBands).toEqual([TOP, LOW]);
  });

  it("menu de contexto sobre uma área: item único Apagar área", () => {
    const v = mount(projectWith([mkSource("A", [mkLine("line-1", { neumeBands: [TOP, LOW] })])]));
    act(() => v.ref.recortes!.setBandTool(true));
    const top = v.container.querySelector('[data-neume-band="0"]') as HTMLElement;
    fireEvent.contextMenu(top, { clientX: 50, clientY: 15 });
    const menu = v.getByRole("menu");
    const items = within(menu).getAllByRole("menuitem");
    expect(items.map((i) => i.textContent)).toEqual(["Apagar área"]);
    fireEvent.click(items[0]);
    expect(v.line().neumeBands).toEqual([LOW]);
  });

  it("selecionar a área sem mexer não cria passo de desfazer; trocar de página limpa a seleção", () => {
    const v = mount(projectWith([mkSource("A", [mkLine("line-1", { neumeBands: [TOP] }), mkLine("line-2")])]));
    act(() => v.ref.recortes!.setBandTool(true));
    const band = v.container.querySelector('[data-neume-band="0"]') as HTMLElement;
    pointer(band, "pointerdown", 100, 15);
    pointer(band, "pointerup", 100, 15);
    const overlay = v.container.querySelector("[data-band-overlay]") as HTMLElement;
    pointer(overlay, "pointerdown", 100, 15);
    pointer(overlay, "pointerup", 100, 15);
    expect(v.ref.history!.canUndo).toBe(false);
    act(() => v.ref.recortes!.selectLine("A", "line-2"));
    expect(v.ref.recortes!.activeBand).toBeNull();
    expect(v.ref.recortes!.bandTool).toBe(true);
  });

  it("dica needsBand liga a ferramenta", async () => {
    window.mocquereau = {
      readClipboardImage: vi.fn(),
      openImageFile: vi.fn(),
      getSuggestionsEnabled: vi.fn(async () => true),
      setSuggestionsEnabled: vi.fn(async (on: boolean) => on),
    } as never;
    const client = fakeClient();
    const blank = mkLine("line-1", { syllableRange: { start: 0, end: 4 }, syllableBoxes: {}, confirmed: false });
    const v = mount(projectWith([mkSource("A", [blank])]), client);
    await act(async () => {});
    v.key({ key: "G", ctrlKey: true, shiftKey: true });
    await waitFor(() => expect(client.calls.length).toBe(1));
    await act(async () => {
      client.calls[0].resolve({ suggestions: [], debug: { needsBand: true } as SuggestResult["debug"] });
      await Promise.resolve();
    });
    expect(v.ref.recortes!.bandTool).toBe(true);
  });
});

