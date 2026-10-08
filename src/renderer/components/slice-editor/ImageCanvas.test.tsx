// @vitest-environment jsdom
import "../../i18n";
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render } from "@testing-library/react";
import { ImageCanvas } from "./ImageCanvas";

afterEach(cleanup);

const IMAGE = { dataUrl: "data:image/png;base64,iVBORw0KGgo=", width: 100, height: 50, mimeType: "image/png" };

function setup(zoom = 1) {
  const onZoomChange = vi.fn<(z: number) => void>();
  const utils = render(
    <ImageCanvas
      image={IMAGE}
      syllableBoxes={{}}
      activeSyllableIdx={null}
      syllableRange={{ start: 0, end: 3 }}
      zoom={zoom}
      onZoomChange={onZoomChange}
    />,
  );
  const wrapper = utils.container.querySelector("[data-image-wrapper]") as HTMLElement;
  const zooms = () => onZoomChange.mock.calls.map(([z]) => z);
  return { ...utils, wrapper, onZoomChange, zooms };
}

function wheel(target: Element, init: WheelEventInit) {
  const ev = new WheelEvent("wheel", { bubbles: true, cancelable: true, ...init });
  act(() => {
    target.dispatchEvent(ev);
  });
  return ev;
}

describe("ImageCanvas: zoom pela roda", () => {
  it("roda sobre o fólio aproxima e cancela a rolagem nativa (listener não passivo)", () => {
    const { wrapper, zooms } = setup(1);
    const ev = wheel(wrapper, { deltaY: -100, clientX: 10, clientY: 10 });
    expect(ev.defaultPrevented).toBe(true);
    expect(zooms()).toHaveLength(1);
    expect(zooms()[0]).toBeGreaterThan(1);
  });

  it("Ctrl+roda também aproxima (e não chega ao zoom da página)", () => {
    const { wrapper, zooms } = setup(1);
    const ev = wheel(wrapper, { deltaY: -100, ctrlKey: true });
    expect(ev.defaultPrevented).toBe(true);
    expect(zooms()[0]).toBeGreaterThan(1);
  });

  it("Shift+roda fica com a rolagem horizontal nativa", () => {
    const { wrapper, zooms } = setup(1);
    const ev = wheel(wrapper, { deltaY: -100, shiftKey: true });
    expect(ev.defaultPrevented).toBe(false);
    expect(zooms()).toHaveLength(0);
  });

  it("o wrapper usa a largura do zoom mesmo abaixo de 100% (sem minWidth que anula o afastar)", () => {
    const { wrapper } = setup(0.5);
    expect(wrapper.style.width).toBe("50%");
    expect(wrapper.style.minWidth).toBe("");
  });
});

describe("ImageCanvas: controles de giro", () => {
  function setupRot(rotation = 0) {
    const onUpdate = vi.fn<(p: { rotation?: number }) => void>();
    const utils = render(
      <ImageCanvas
        image={IMAGE}
        syllableBoxes={{}}
        activeSyllableIdx={null}
        syllableRange={{ start: 0, end: 3 }}
        zoom={1}
        onZoomChange={vi.fn()}
        adjustments={{ brightness: 100, contrast: 100, saturation: 100, grayscale: 0, invert: false, rotation, flipH: false, flipV: false }}
        onUpdateAdjustments={onUpdate}
      />,
    );
    return { ...utils, onUpdate };
  }
  const key = (init: KeyboardEventInit, target: EventTarget = window) =>
    act(() => {
      target.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, cancelable: true, ...init }));
    });

  it("botões giram 90° para os dois lados", () => {
    const { getByRole, onUpdate } = setupRot(0);
    fireEvent.click(getByRole("button", { name: /Girar 90° à direita/ }));
    fireEvent.click(getByRole("button", { name: /Girar 90° à esquerda/ }));
    expect(onUpdate.mock.calls.map(([p]) => p.rotation)).toEqual([90, 270]);
  });

  it("Ctrl+] / Ctrl+[ giram; ignora campo de texto e menu aberto", () => {
    const { onUpdate } = setupRot(90);
    key({ key: "]", ctrlKey: true });
    key({ key: "[", ctrlKey: true });
    expect(onUpdate.mock.calls.map(([p]) => p.rotation)).toEqual([180, 0]);
    const input = document.createElement("input");
    document.body.appendChild(input);
    key({ key: "]", ctrlKey: true }, input);
    expect(onUpdate).toHaveBeenCalledTimes(2);
    const menu = document.createElement("div");
    menu.setAttribute("role", "menu");
    document.body.appendChild(menu);
    key({ key: "]", ctrlKey: true });
    expect(onUpdate).toHaveBeenCalledTimes(2);
    menu.remove();
    input.remove();
  });

  it("Endireitar abre o popover; slider mantém o quarto de volta; zerar e Esc", () => {
    const { getByRole, queryByRole, onUpdate } = setupRot(92);
    expect(queryByRole("dialog")).toBeNull();
    fireEvent.click(getByRole("button", { name: "Endireitar (giro fino)" }));
    expect(getByRole("dialog")).toBeTruthy();
    fireEvent.change(getByRole("slider"), { target: { value: "-3.5" } });
    expect(onUpdate).toHaveBeenLastCalledWith({ rotation: 86.5 });
    fireEvent.click(getByRole("button", { name: "Zerar ângulo fino" }));
    expect(onUpdate).toHaveBeenLastCalledWith({ rotation: 90 });
    key({ key: "Escape" });
    expect(queryByRole("dialog")).toBeNull();
  });

  it("sem onUpdateAdjustments não mostra os controles de giro", () => {
    const { container } = setup(1);
    expect(container.querySelectorAll(".sc-zoom")).toHaveLength(1);
  });
});

describe("ImageCanvas: controle flutuante de zoom (sc-zoom)", () => {
  it("mostra a porcentagem e os botões −/+; clicar na porcentagem ajusta (100%)", () => {
    const { container, zooms, getByRole } = setup(1.5);
    const ctl = container.querySelector(".sc-zoom") as HTMLElement;
    expect(ctl).not.toBeNull();
    expect(ctl.textContent).toContain("150%");
    fireEvent.click(getByRole("button", { name: /Aumentar zoom/ }));
    fireEvent.click(getByRole("button", { name: /Diminuir zoom/ }));
    fireEvent.click(getByRole("button", { name: /Ajustar/ }));
    expect(zooms()).toEqual([2, 1.25, 1]);
  });
});

describe("ImageCanvas: atalhos Ctrl+= / Ctrl+- / Ctrl+0", () => {
  it.each([
    ["=", 1, 1.25],
    ["-", 1, 0.75],
    ["0", 2, 1],
  ])("Ctrl+%s com zoom %s vai a %s", (key, from, to) => {
    const { zooms } = setup(from);
    const ev = new KeyboardEvent("keydown", { key, ctrlKey: true, bubbles: true, cancelable: true });
    window.dispatchEvent(ev);
    expect(ev.defaultPrevented).toBe(true);
    expect(zooms()).toEqual([to]);
  });

  it("não disparam enquanto se digita num campo", () => {
    const { zooms } = setup(1);
    const input = document.createElement("input");
    document.body.appendChild(input);
    fireEvent.keyDown(input, { key: "=", ctrlKey: true });
    fireEvent.keyDown(input, { key: "0", ctrlKey: true });
    input.remove();
    expect(zooms()).toEqual([]);
  });
});

describe("ImageCanvas: etiquetas das caixas e painel Ajustes", () => {
  function setupBoxes(extra: Record<string, unknown> = {}) {
    return render(
      <ImageCanvas
        image={IMAGE}
        syllableBoxes={{ 0: { x: 0.1, y: 0.2, w: 0.2, h: 0.3 }, 1: { x: 0.4, y: 0.2, w: 0.2, h: 0.3 } }}
        activeSyllableIdx={0}
        syllableRange={{ start: 0, end: 1 }}
        zoom={1}
        onZoomChange={vi.fn()}
        showAllBoxes
        {...extra}
      />,
    );
  }

  it("caixa não ativa: etiqueta só aparece no hover/foco e fica fora da caixa (sc-box__tag)", () => {
    const { container } = setupBoxes();
    const box = container.querySelector("[data-image-wrapper] > div.group") as HTMLElement;
    expect(box).not.toBeNull();
    const label = box.querySelector("[data-box-label]") as HTMLElement;
    expect(label.className).toContain("sc-box__tag");
    expect(label.className).toContain("opacity-0");
    expect(label.className).toContain("group-hover:opacity-100");
    expect(label.className).toContain("group-focus:opacity-100");
    expect(label.className).not.toMatch(/\btop-0\b/);
  });

  it("painel Ajustes fica fora do contêiner rolável, com max-height e rolagem própria", () => {
    const { container } = setupBoxes({
      panelOpen: true,
      onUpdateAdjustments: vi.fn(),
      onClosePanel: vi.fn(),
    });
    const panel = container.querySelector("[data-image-adjustments-panel]") as HTMLElement;
    const scroller = container.querySelector("[data-canvas-scroller]") as HTMLElement;
    expect(panel).not.toBeNull();
    expect(scroller.contains(panel)).toBe(false);
    expect(panel.className).toContain("sc-panel");
    expect(panel.className).toContain("overflow-y-auto");
    expect(panel.style.maxHeight).toBe("calc(100% - 16px)");
  });
});

describe("ImageCanvas: rascunho do arraste", () => {
  it("vale só sobre as caixas em que foi desenhado (troca de página ou desfazer o descartam)", () => {
    const offW = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "offsetWidth")!;
    Object.defineProperty(HTMLElement.prototype, "offsetWidth", { configurable: true, get: () => 100 });
    Object.assign(HTMLElement.prototype, { setPointerCapture: vi.fn(), hasPointerCapture: () => true });
    try {
      const props = {
        image: IMAGE,
        activeSyllableIdx: 0,
        syllableRange: { start: 0, end: 1 },
        zoom: 1,
        onZoomChange: vi.fn(),
      };
      const { container, rerender } = render(
        <ImageCanvas {...props} syllableBoxes={{ 0: { x: 0.1, y: 0.1, w: 0.2, h: 0.2 } }} />,
      );
      const overlay = () => container.querySelector("[data-box-overlay]") as HTMLElement;
      const ev = (type: string, x: number) =>
        act(() => void overlay().dispatchEvent(new MouseEvent(type, { bubbles: true, clientX: x, clientY: 0 })));
      ev("pointerdown", 10);
      ev("pointermove", 30);
      expect(parseFloat(overlay().style.left)).toBeCloseTo(30, 6);
      rerender(<ImageCanvas {...props} syllableBoxes={{ 0: { x: 0.5, y: 0.1, w: 0.2, h: 0.2 } }} />);
      expect(overlay().style.left).toBe("50%");
    } finally {
      Object.defineProperty(HTMLElement.prototype, "offsetWidth", offW);
    }
  });
});
