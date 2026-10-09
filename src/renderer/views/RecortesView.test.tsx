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
import { SuggestionsProvider } from "../hooks/SuggestionsContext";
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
  } = {};
  function Grab() {
    ref.recortes = useRecortesContext();
    return null;
  }
  function Harness() {
    const [state, dispatch, history] = useProjectReducer();
    Object.assign(ref, { state, dispatch, history });
    if (!state.project) return null;
    return (
      <ProjectContext.Provider value={{ state, dispatch, history }}>
        <RecortesProvider>
          <SuggestionsProvider createClient={() => client}>
            <Grab />
            <MenuShortcuts />
            <RecortesView />
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

function pointer(el: Element, type: string, clientX: number, clientY: number, button = 0) {
  act(() => {
    el.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, clientX, clientY, button }));
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

  it("clicar numa sugestão ativa a sílaba sem aceitar", async () => {
    const v = await mountOn();
    await v.suggestWith({ 0: B0, 2: B2 });
    const s2 = v.suggested().find((el) => el.style.left === "45%")!;
    fireEvent.click(s2);
    expect(v.ref.recortes!.activeSyllable).toBe(2);
    expect(v.line().syllableBoxes).toEqual({});
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
  });
});
