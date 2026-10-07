// @vitest-environment jsdom
import "../../i18n";
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render } from "@testing-library/react";
import { ImageCanvas } from "./ImageCanvas";
import type { EditorAction } from "./editorReducer";

afterEach(cleanup);

const IMAGE = { dataUrl: "data:image/png;base64,iVBORw0KGgo=", width: 100, height: 50, mimeType: "image/png" };

function setup(zoom = 1) {
  const dispatch = vi.fn<(a: EditorAction) => void>();
  const utils = render(
    <ImageCanvas
      image={IMAGE}
      syllableBoxes={{}}
      activeSyllableIdx={null}
      syllableRange={{ start: 0, end: 3 }}
      gaps={[]}
      hoveredSyllableIdx={null}
      zoom={zoom}
      panOffset={{ x: 0, y: 0 }}
      dispatch={dispatch}
    />,
  );
  const wrapper = utils.container.querySelector("[data-image-wrapper]") as HTMLElement;
  const zooms = () =>
    dispatch.mock.calls.map(([a]) => a).filter((a) => a.type === "SET_ZOOM").map((a) => (a as { payload: number }).payload);
  return { ...utils, wrapper, dispatch, zooms };
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
