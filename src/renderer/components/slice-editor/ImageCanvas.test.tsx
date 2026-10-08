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

  it("o controle flutuante tem só o zoom: sem botões de girar nem endireitar", () => {
    const { container, queryByRole } = setupRot(0);
    expect(container.querySelectorAll(".sc-zoom")).toHaveLength(1);
    const buttons = Array.from(container.querySelectorAll(".sc-zoom button")).map((b) => b.getAttribute("aria-label"));
    expect(buttons).toEqual([expect.stringMatching(/^Diminuir zoom/), expect.stringMatching(/100%/), expect.stringMatching(/^Aumentar zoom/)]);
    expect(queryByRole("button", { name: /Girar|Endireitar/ })).toBeNull();
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

describe("ImageCanvas: etiquetas das caixas e modo desenhar", () => {
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

  it("só a caixa ativa mostra a etiqueta; as outras só no foco pelo teclado, não no hover", () => {
    const { container } = setupBoxes();
    const active = container.querySelector("[data-box-overlay]") as HTMLElement;
    expect(active.querySelector(".sc-box__tag")?.textContent).toBeTruthy();
    const box = container.querySelector("[data-image-wrapper] > div.group") as HTMLElement;
    expect(box).not.toBeNull();
    expect(box.getAttribute("title")).toBeNull();
    expect(box.tabIndex).toBe(0);
    const label = box.querySelector("[data-box-label]") as HTMLElement;
    expect(label.className).toContain("sc-box__tag");
    expect(label.className).toContain("opacity-0");
    expect(label.className).toContain("group-focus-visible:opacity-100");
    expect(label.className).not.toMatch(/group-hover/);
  });

  it("com Desenhar desligado o clique na folha não começa caixa", () => {
    const commit = vi.fn();
    const props = {
      image: IMAGE,
      syllableBoxes: {},
      activeSyllableIdx: 0,
      syllableRange: { start: 0, end: 1 },
      zoom: 1,
      onZoomChange: vi.fn(),
      onBoxCommit: commit,
    };
    Object.assign(HTMLElement.prototype, { setPointerCapture: vi.fn(), releasePointerCapture: vi.fn() });
    const { container, rerender } = render(<ImageCanvas {...props} drawMode={false} />);
    const wrapper = container.querySelector("[data-image-wrapper]") as HTMLElement;
    wrapper.getBoundingClientRect = () => ({ left: 0, top: 0, width: 100, height: 100, right: 100, bottom: 100, x: 0, y: 0, toJSON() {} });
    const drag = () => {
      for (const [type, x] of [["pointerdown", 10], ["pointermove", 40], ["pointerup", 40]] as const) {
        act(() => void wrapper.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, clientX: x, clientY: x })));
      }
    };
    expect(wrapper.className).not.toContain("cursor-crosshair");
    drag();
    expect(commit).not.toHaveBeenCalled();
    rerender(<ImageCanvas {...props} drawMode />);
    expect(wrapper.className).toContain("cursor-crosshair");
    drag();
    expect(commit).toHaveBeenCalledOnce();
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
