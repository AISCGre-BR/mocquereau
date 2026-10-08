// @vitest-environment jsdom
import "../../i18n";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { RecortesTools } from "./RecortesTools";
import { RecortesView } from "../../views/RecortesView";
import { RecortesProvider } from "../../hooks/RecortesContext";
import {
  ProjectContext,
  createNewProject,
  useProjectReducer,
  type DocumentAction,
  type HistoryApi,
  type ProjectState,
} from "../../hooks/useProject";
import { syllabifyText } from "../../lib/syllabify";
import type { ManuscriptLine, ManuscriptSource, MocquereauProject } from "../../lib/models";

const IMG = { dataUrl: "data:image/png;base64,iVBORw0KGgo=", width: 100, height: 50, mimeType: "image/png" };
const RECT = { left: 0, top: 0, width: 200, height: 100, right: 200, bottom: 100, x: 0, y: 0, toJSON() {} };

function mkLine(id: string, overrides: Partial<ManuscriptLine> = {}): ManuscriptLine {
  return { id, image: IMG, syllableRange: { start: 0, end: 3 }, dividers: [], gaps: [], syllableBoxes: {}, confirmed: false, ...overrides };
}

function projectWith(lines: ManuscriptLine[]): MocquereauProject {
  const raw = "Puer natus est";
  const source: ManuscriptSource = {
    id: "A",
    order: 1,
    metadata: { siglum: "A", library: "", city: "", century: "", classes: [null, null, null] },
    lines,
    syllableCuts: {},
  };
  return { ...createNewProject("T", ""), text: { raw, words: syllabifyText(raw, "sung"), hyphenationMode: "sung" }, sources: [source] };
}

/** Toolbar tools and the view under one provider, like App. */
function mount(project: MocquereauProject) {
  const ref: { state?: ProjectState; dispatch?: React.Dispatch<DocumentAction>; history?: HistoryApi } = {};
  function Harness() {
    const [state, dispatch, history] = useProjectReducer();
    Object.assign(ref, { state, dispatch, history });
    if (!state.project) return null;
    return (
      <ProjectContext.Provider value={{ state, dispatch, history }}>
        <RecortesProvider>
          <div role="toolbar">
            <RecortesTools />
          </div>
          <RecortesView />
        </RecortesProvider>
      </ProjectContext.Provider>
    );
  }
  const utils = render(<Harness />);
  act(() => ref.dispatch!({ type: "SET_PROJECT", payload: project }));
  const line = (i = 0) => ref.state!.project!.sources[0].lines[i];
  const openPanel = () => {
    fireEvent.click(screen.getByRole("button", { name: /Imagem/ }));
    return screen.getByRole("dialog", { name: "Imagem" });
  };
  return { ...utils, ref, line, openPanel };
}

beforeEach(() => {
  window.mocquereau = { readClipboardImage: vi.fn(), openImageFile: vi.fn() } as never;
  Element.prototype.scrollIntoView = vi.fn();
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue(RECT as DOMRect);
  Object.assign(HTMLElement.prototype, { setPointerCapture: vi.fn(), releasePointerCapture: vi.fn(), hasPointerCapture: vi.fn(() => true) });
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("RecortesTools: alternâncias", () => {
  it("Desenhar e Mostrar todas começam ligadas, Mesmo tamanho desligada; o clique alterna", () => {
    mount(projectWith([mkLine("a1")]));
    const draw = screen.getByRole("button", { name: "Desenhar caixa" });
    const same = screen.getByRole("button", { name: "Mesmo tamanho da anterior" });
    const all = screen.getByRole("button", { name: "Mostrar todas as caixas" });
    expect([draw, same, all].map((b) => b.getAttribute("aria-pressed"))).toEqual(["true", "false", "true"]);
    fireEvent.click(same);
    fireEvent.click(all);
    expect([same, all].map((b) => b.getAttribute("aria-pressed"))).toEqual(["true", "false"]);
  });

  it("com Desenhar desligado, arrastar na folha não cria caixa; religado, cria", () => {
    const v = mount(projectWith([mkLine("a1")]));
    const wrapper = v.container.querySelector("[data-image-wrapper]") as HTMLElement;
    const drag = () => {
      for (const [type, x] of [["pointerdown", 20], ["pointermove", 80], ["pointerup", 80]] as const) {
        act(() => void wrapper.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, clientX: x, clientY: x })));
      }
    };
    fireEvent.click(screen.getByRole("button", { name: "Desenhar caixa" }));
    drag();
    expect(v.line().syllableBoxes).toEqual({});
    fireEvent.click(screen.getByRole("button", { name: "Desenhar caixa" }));
    drag();
    expect(v.line().syllableBoxes?.[0]).toBeTruthy();
  });

  it("Mostrar todas desligado esconde o contorno das outras caixas", () => {
    const BOX = { x: 0.1, y: 0.1, w: 0.1, h: 0.1 };
    const v = mount(projectWith([mkLine("a1", { syllableBoxes: { 0: BOX, 1: { ...BOX, x: 0.5 } }, confirmed: true })]));
    const others = () => v.container.querySelectorAll("[data-image-wrapper] > div.sc-box:not([data-box-overlay])");
    expect(others()).toHaveLength(1);
    fireEvent.click(screen.getByRole("button", { name: "Mostrar todas as caixas" }));
    expect(others()).toHaveLength(0);
  });
});

describe("RecortesTools: painel Imagem", () => {
  it("botão Imagem fica pressionado com o painel aberto; Esc e o clique fora fecham", () => {
    const v = mount(projectWith([mkLine("a1")]));
    const button = screen.getByRole("button", { name: /Imagem/ });
    expect(button.getAttribute("aria-pressed")).toBe("false");
    v.openPanel();
    expect(button.getAttribute("aria-pressed")).toBe("true");
    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.queryByRole("dialog", { name: "Imagem" })).toBeNull();
    v.openPanel();
    fireEvent.pointerDown(document.body);
    expect(screen.queryByRole("dialog", { name: "Imagem" })).toBeNull();
    v.openPanel();
    fireEvent.pointerDown(button);
    fireEvent.click(button);
    expect(screen.queryByRole("dialog", { name: "Imagem" })).toBeNull();
  });

  it("aplica giro, espelho, inclinação, brilho/contraste/saturação e as chaves", () => {
    const v = mount(projectWith([mkLine("a1")]));
    const panel = v.openPanel();
    const q = within(panel);
    fireEvent.click(q.getByRole("button", { name: "Girar à direita" }));
    expect(v.line().imageAdjustments?.rotation).toBe(90);
    fireEvent.click(q.getByRole("button", { name: "Girar à esquerda" }));
    fireEvent.click(q.getByRole("button", { name: "Girar à esquerda" }));
    expect(v.line().imageAdjustments?.rotation).toBe(270);
    fireEvent.click(q.getByRole("button", { name: "Espelhar" }));
    expect(v.line().imageAdjustments?.flipH).toBe(true);
    expect(q.getByRole("button", { name: "Espelhar" }).getAttribute("aria-pressed")).toBe("true");

    const tilt = q.getByRole("slider", { name: "Inclinação" }) as HTMLInputElement;
    expect([tilt.min, tilt.max]).toEqual(["-45", "45"]);
    fireEvent.change(tilt, { target: { value: "5" } });
    expect(v.line().imageAdjustments?.rotation).toBe(275); // mantém o quarto de volta
    expect(q.getByText("5,0°")).toBeTruthy();
    fireEvent.click(q.getByRole("button", { name: "Endireitar" }));
    expect(document.activeElement).toBe(tilt);

    fireEvent.change(q.getByRole("slider", { name: "Brilho" }), { target: { value: "115" } });
    fireEvent.change(q.getByRole("slider", { name: "Contraste" }), { target: { value: "125" } });
    fireEvent.change(q.getByRole("slider", { name: "Saturação" }), { target: { value: "80" } });
    expect(q.getByText("115%")).toBeTruthy();
    fireEvent.click(q.getByRole("switch", { name: "Tons de cinza" }));
    fireEvent.click(q.getByRole("switch", { name: "Inverter" }));
    expect(v.line().imageAdjustments).toMatchObject({ brightness: 115, contrast: 125, saturation: 80, grayscale: 100, invert: true });
    expect(q.getByRole("switch", { name: "Inverter" }).getAttribute("aria-checked")).toBe("true");
    fireEvent.click(q.getByRole("switch", { name: "Tons de cinza" }));
    expect(v.line().imageAdjustments?.grayscale).toBe(0);
  });

  it("Girar e a inclinação logo depois são passos de desfazer separados", () => {
    const v = mount(projectWith([mkLine("a1")]));
    const q = within(v.openPanel());
    fireEvent.click(q.getByRole("button", { name: "Girar à direita" }));
    const tilt = q.getByRole("slider", { name: "Inclinação" });
    fireEvent.change(tilt, { target: { value: "2" } });
    fireEvent.change(tilt, { target: { value: "3" } });
    expect(v.line().imageAdjustments?.rotation).toBe(93);
    act(() => v.ref.history!.undo()); // o arraste da inclinação inteiro
    expect(v.line().imageAdjustments?.rotation).toBe(90);
    act(() => v.ref.history!.undo()); // o Girar
    expect(v.line().imageAdjustments).toBeUndefined();
    expect(v.ref.history!.canUndo).toBe(false);
  });

  it("cada Girar é um passo de desfazer", () => {
    const v = mount(projectWith([mkLine("a1")]));
    const q = within(v.openPanel());
    fireEvent.click(q.getByRole("button", { name: "Girar à direita" }));
    fireEvent.click(q.getByRole("button", { name: "Girar à direita" }));
    act(() => v.ref.history!.undo());
    expect(v.line().imageAdjustments?.rotation).toBe(90);
  });

  it("Tons de cinza legado (40) aparece ligado; desligar grava 0", () => {
    const v = mount(
      projectWith([mkLine("a1", { imageAdjustments: { brightness: 100, contrast: 100, saturation: 100, grayscale: 40, invert: false, rotation: 0, flipH: false, flipV: false } })]),
    );
    const sw = within(v.openPanel()).getByRole("switch", { name: "Tons de cinza" });
    expect(sw.getAttribute("aria-checked")).toBe("true");
    fireEvent.click(sw);
    expect(v.line().imageAdjustments?.grayscale ?? 0).toBe(0);
  });

  it("Esc tratado por um menu interno não fecha o painel", () => {
    const v = mount(projectWith([mkLine("a1")]));
    const panel = v.openPanel();
    const inner = document.createElement("div");
    panel.appendChild(inner);
    inner.addEventListener("keydown", (e) => e.preventDefault());
    fireEvent.keyDown(inner, { key: "Escape" });
    expect(screen.getByRole("dialog", { name: "Imagem" })).toBeTruthy();
  });

  it("abrir leva o foco ao primeiro controle; Esc fecha e devolve o foco ao botão Imagem", () => {
    const v = mount(projectWith([mkLine("a1")]));
    const panel = v.openPanel();
    expect(document.activeElement).toBe(within(panel).getByRole("button", { name: "Girar à esquerda" }));
    fireEvent.keyDown(document.activeElement!, { key: "Escape" });
    expect(screen.queryByRole("dialog", { name: "Imagem" })).toBeNull();
    expect(document.activeElement).toBe(screen.getByRole("button", { name: /Imagem/ }));
  });

  it("Aplicar às outras páginas sem nada a mudar não cria passo de desfazer", () => {
    const v = mount(projectWith([mkLine("a1"), mkLine("a2")]));
    fireEvent.click(within(v.openPanel()).getByRole("button", { name: "Aplicar às outras páginas" }));
    expect(v.ref.history!.canUndo).toBe(false);
  });

  it("Restaurar volta tudo ao padrão", () => {
    const v = mount(
      projectWith([mkLine("a1", { imageAdjustments: { brightness: 140, contrast: 90, saturation: 100, grayscale: 100, invert: true, rotation: 93, flipH: true, flipV: false } })]),
    );
    fireEvent.click(within(v.openPanel()).getByRole("button", { name: "Restaurar" }));
    expect(v.line().imageAdjustments).toBeUndefined();
  });

  it("Aplicar às outras páginas copia os ajustes para as demais páginas numa entrada de desfazer", () => {
    const adj = { brightness: 120, contrast: 100, saturation: 100, grayscale: 0, invert: false, rotation: 2, flipH: false, flipV: false };
    const v = mount(projectWith([mkLine("a1", { imageAdjustments: adj }), mkLine("a2"), mkLine("a3", { imageAdjustments: { ...adj, invert: true } })]));
    const before = v.ref.state!.project;
    fireEvent.click(within(v.openPanel()).getByRole("button", { name: "Aplicar às outras páginas" }));
    expect([v.line(1).imageAdjustments, v.line(2).imageAdjustments]).toEqual([adj, adj]);
    act(() => v.ref.history!.undo());
    expect(v.ref.state!.project).toBe(before);
  });

  it("numa fonte de uma página só, Aplicar às outras páginas fica desabilitado", () => {
    const v = mount(projectWith([mkLine("a1")]));
    expect((within(v.openPanel()).getByRole("button", { name: "Aplicar às outras páginas" }) as HTMLButtonElement).disabled).toBe(true);
  });
});
