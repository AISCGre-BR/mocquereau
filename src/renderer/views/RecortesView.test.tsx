// @vitest-environment jsdom
import "../i18n";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render } from "@testing-library/react";
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
import type { ManuscriptLine, ManuscriptSource, MocquereauProject } from "../lib/models";

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

/** Real document reducer (with history) around the view. */
function mount(project: MocquereauProject) {
  const ref: { state?: ProjectState; dispatch?: React.Dispatch<DocumentAction>; history?: HistoryApi } = {};
  function Harness() {
    const [state, dispatch, history] = useProjectReducer();
    Object.assign(ref, { state, dispatch, history });
    if (!state.project) return null;
    return (
      <ProjectContext.Provider value={{ state, dispatch, history }}>
        <RecortesView />
      </ProjectContext.Provider>
    );
  }
  const utils = render(<Harness />);
  act(() => ref.dispatch!({ type: "SET_PROJECT", payload: project }));
  const line = (sourceIdx = 0, lineIdx = 0) => ref.state!.project!.sources[sourceIdx].lines[lineIdx];
  const wrapper = () => utils.container.querySelector("[data-image-wrapper]") as HTMLElement;
  const key = (init: KeyboardEventInit) => act(() => void fireEvent.keyDown(window, init));
  return { ...utils, ref, line, wrapper, key };
}

function pointer(el: Element, type: string, clientX: number, clientY: number) {
  act(() => {
    el.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, clientX, clientY }));
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
    // Página nova selecionada, com o intervalo sugerido depois da última confirmada.
    const [from] = v.getAllByRole("spinbutton") as HTMLInputElement[];
    expect(from.value).toBe("4");

    act(() => v.ref.dispatch!({ type: "UNDO" }));
    expect(v.ref.state!.project!.sources[0].lines).toHaveLength(1);
    const [fromAfter, toAfter] = v.getAllByRole("spinbutton") as HTMLInputElement[];
    expect([fromAfter.value, toAfter.value]).toEqual(["0", "3"]);
    expect(v.wrapper()).not.toBeNull();
  });

  it("range changes go to the project and keep boxes outside the range", () => {
    const v = mount(projectWith([mkSource("A", [mkLine("line-1", { syllableBoxes: { 0: BOX, 3: BOX } })])]));
    const [, to] = v.getAllByRole("spinbutton") as HTMLInputElement[];
    fireEvent.change(to, { target: { value: "1" } });
    expect(v.line().syllableRange).toEqual({ start: 0, end: 1 });
    expect(v.line().syllableBoxes![3]).toEqual(BOX);
  });
});

describe("RecortesView: intervalo de uma sílaba", () => {
  it("{0,0} é mostrado e gravado como está; clicar numa sílaba estende a partir dele", () => {
    const v = mount(projectWith([mkSource("A", [mkLine("line-1", { syllableRange: { start: 0, end: 0 } })])]));
    const [from, to] = v.getAllByRole("spinbutton") as HTMLInputElement[];
    expect([from.value, to.value]).toEqual(["0", "0"]);
    fireEvent.click(v.getByText("na"));
    expect(v.line().syllableRange).toEqual({ start: 0, end: 2 });
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

  it("Ctrl+Enter vai para a próxima fonte", () => {
    const v = mount(
      projectWith([
        mkSource("A", [mkLine("a1")]),
        mkSource("B", [mkLine("b1", { syllableRange: { start: 1, end: 2 }, confirmed: false, syllableBoxes: {} })]),
      ]),
    );
    v.key({ key: "Enter", ctrlKey: true });
    const [from, to] = v.getAllByRole("spinbutton") as HTMLInputElement[];
    expect([from.value, to.value]).toEqual(["1", "2"]);
  });

  it("Delete remove a caixa ativa na hora e desconfirma a página vazia", () => {
    const v = mount(projectWith());
    v.key({ key: "Delete" });
    expect(v.line().syllableBoxes![0]).toBeNull();
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
  it("isOutsideEditorKeys reconhece menus, toolbar, diálogo, abas, botões e selects", () => {
    document.body.innerHTML = `
      <div role="menubar"><span id="m">Arquivo</span></div>
      <div role="toolbar"><span id="tb">x</span></div>
      <div role="dialog"><span id="d">x</span></div>
      <div role="tablist"><span id="tl">x</span></div>
      <div role="menu"><div id="mi">x</div></div>
      <button id="b">ok</button><select id="s"></select>
      <div id="canvas"></div>`;
    for (const id of ["m", "tb", "d", "tl", "mi", "b", "s"]) {
      expect(isOutsideEditorKeys(document.getElementById(id)!)).toBe(true);
    }
    expect(isOutsideEditorKeys(document.getElementById("canvas")!)).toBe(false);
    document.body.innerHTML = "";
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
        <div className="flex">
          <RecortesView />
        </div>
      </ProjectContext.Provider>,
    );
    const root = (container.firstChild as HTMLElement).firstChild as HTMLElement;
    const editor = root.firstChild as HTMLElement;
    expect(editor.className.split(/\s+/)).toContain("min-w-0");
  });
});
