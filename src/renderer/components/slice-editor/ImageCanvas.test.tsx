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

describe("ImageCanvas: áreas da linha de neumas (S7)", () => {
  const RECT100 = { left: 0, top: 0, width: 100, height: 100, right: 100, bottom: 100, x: 0, y: 0, toJSON() {} };
  const BAND = { x: 0.1, y: 0.5, w: 0.5, h: 0.1 };

  function setupBands(extra: Record<string, unknown> = {}) {
    Object.assign(HTMLElement.prototype, {
      setPointerCapture: vi.fn(),
      releasePointerCapture: vi.fn(),
      hasPointerCapture: () => true,
    });
    const onBandsCommit = vi.fn();
    const onBoxCommit = vi.fn();
    const onActivateBand = vi.fn();
    const props = {
      image: IMAGE,
      syllableBoxes: {},
      activeSyllableIdx: 0,
      syllableRange: { start: 0, end: 1 },
      zoom: 1,
      onZoomChange: vi.fn(),
      onBoxCommit,
      onBandsCommit,
      onActivateBand,
      neumeBands: [BAND],
      drawMode: true,
      ...extra,
    };
    const utils = render(<ImageCanvas {...props} />);
    const wrapper = utils.container.querySelector("[data-image-wrapper]") as HTMLElement;
    wrapper.getBoundingClientRect = () => RECT100 as DOMRect;
    const ev = (el: Element, type: string, x: number, y: number) =>
      act(() => void el.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, clientX: x, clientY: y })));
    return { ...utils, props, wrapper, ev, onBandsCommit, onBoxCommit, onActivateBand };
  }

  it("com a ferramenta, arrastar na folha cria uma área (não uma caixa) e a nova fica ativa", () => {
    const v = setupBands({ bandTool: true });
    expect(v.wrapper.className).toContain("cursor-crosshair");
    v.ev(v.wrapper, "pointerdown", 10, 10);
    v.ev(v.wrapper, "pointermove", 90, 20);
    v.ev(v.wrapper, "pointerup", 90, 20);
    expect(v.onBoxCommit).not.toHaveBeenCalled();
    expect(v.onBandsCommit).toHaveBeenCalledOnce();
    const [bands, active] = v.onBandsCommit.mock.calls[0];
    expect(bands.map((b: { y: number }) => +b.y.toFixed(9))).toEqual([0.1, 0.5]);
    expect(+bands[0].w.toFixed(9)).toBe(0.8);
    expect(active).toBe(0);
  });

  it("desligar a ferramenta no meio do arraste descarta a área", () => {
    const v = setupBands({ bandTool: true });
    v.ev(v.wrapper, "pointerdown", 10, 10);
    v.ev(v.wrapper, "pointermove", 90, 20);
    v.rerender(<ImageCanvas {...v.props} bandTool={false} />);
    v.ev(v.wrapper, "pointerup", 90, 20);
    expect(v.onBandsCommit).not.toHaveBeenCalled();
    expect(v.onBoxCommit).not.toHaveBeenCalled();
  });

  it("área menor que o mínimo não é gravada", () => {
    const v = setupBands({ bandTool: true });
    v.ev(v.wrapper, "pointerdown", 10, 10);
    v.ev(v.wrapper, "pointermove", 10.5, 30);
    v.ev(v.wrapper, "pointerup", 10.5, 30);
    expect(v.onBandsCommit).not.toHaveBeenCalled();
  });

  it("áreas aparecem sempre; sem a ferramenta não recebem o ponteiro", () => {
    const v = setupBands();
    const band = v.container.querySelector("[data-neume-band]") as HTMLElement;
    expect(band).not.toBeNull();
    expect(band.className).toContain("pointer-events-none");
    expect(band.className).toContain("border-dashed");
    expect(band.className).toContain("border-rule-strong");
    expect(band.style.left).toBe("10%");
    v.rerender(<ImageCanvas {...v.props} bandTool />);
    expect((v.container.querySelector("[data-neume-band]") as HTMLElement).className).not.toContain("pointer-events-none");
  });

  it("clicar numa área a seleciona; arrastar a alça e aumenta w e grava a lista inteira", () => {
    const offW = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "offsetWidth")!;
    Object.defineProperty(HTMLElement.prototype, "offsetWidth", { configurable: true, get: () => 100 });
    try {
      const other = { x: 0, y: 0.8, w: 1, h: 0.1 };
      const v = setupBands({ bandTool: true, neumeBands: [BAND, other] });
      const band = v.container.querySelector('[data-neume-band="0"]') as HTMLElement;
      v.ev(band, "pointerdown", 20, 55);
      v.ev(band, "pointerup", 20, 55);
      expect(v.onActivateBand).toHaveBeenCalledWith(0);
      expect(v.onBandsCommit).not.toHaveBeenCalled();
      v.rerender(<ImageCanvas {...v.props} bandTool neumeBands={[BAND, other]} activeBand={0} />);
      const overlay = v.container.querySelector("[data-band-overlay]") as HTMLElement;
      expect(overlay.querySelectorAll(".sc-box__h")).toHaveLength(8);
      expect(overlay.className).not.toMatch(/sc-pig-/);
      const handle = overlay.querySelector('[data-handle="e"]') as HTMLElement;
      v.ev(handle, "pointerdown", 60, 55);
      v.ev(overlay, "pointermove", 80, 55);
      v.ev(overlay, "pointerup", 80, 55);
      expect(v.onBandsCommit).toHaveBeenCalledOnce();
      const [bands, active] = v.onBandsCommit.mock.calls[0];
      expect(bands).toHaveLength(2);
      expect(+bands[0].w.toFixed(9)).toBe(0.7);
      expect(bands[1]).toEqual(other);
      expect(active).toBe(0);
      expect(v.onBoxCommit).not.toHaveBeenCalled();
    } finally {
      Object.defineProperty(HTMLElement.prototype, "offsetWidth", offW);
    }
  });
});

describe("ImageCanvas: candidatos (M3)", () => {
  const RECT100 = { left: 0, top: 0, width: 100, height: 100, right: 100, bottom: 100, x: 0, y: 0, toJSON() {} };
  const BIG = { x: 0.1, y: 0.1, w: 0.5, h: 0.5 };
  const SMALL = { x: 0.2, y: 0.2, w: 0.1, h: 0.1 };

  function setupCands() {
    Object.assign(HTMLElement.prototype, { setPointerCapture: vi.fn(), releasePointerCapture: vi.fn(), hasPointerCapture: () => true });
    const onPickCandidate = vi.fn();
    const onBoxCommit = vi.fn();
    const utils = render(
      <ImageCanvas
        image={IMAGE}
        syllableBoxes={{}}
        activeSyllableIdx={0}
        syllableRange={{ start: 0, end: 1 }}
        zoom={1}
        onZoomChange={vi.fn()}
        onBoxCommit={onBoxCommit}
        candidates={[BIG, SMALL]}
        onPickCandidate={onPickCandidate}
      />,
    );
    const wrapper = utils.container.querySelector("[data-image-wrapper]") as HTMLElement;
    wrapper.getBoundingClientRect = () => RECT100 as DOMRect;
    const ev = (type: string, x: number, y: number, shiftKey = false) =>
      act(() => void wrapper.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, clientX: x, clientY: y, shiftKey })));
    return { ...utils, wrapper, ev, onPickCandidate, onBoxCommit };
  }

  it("contorno neutro, sem etiqueta, sem ponteiro", () => {
    const v = setupCands();
    const els = v.container.querySelectorAll<HTMLElement>("[data-candidate]");
    expect(els).toHaveLength(2);
    expect(els[0].className).toContain("border-dotted");
    expect(els[0].className).not.toContain("border-dashed");
    expect(els[0].className).toContain("border-rule-strong");
    expect(els[0].className).toContain("pointer-events-none");
    expect(els[0].textContent).toBe("");
  });

  it("clique pega o menor candidato sob o ponto; Shift vai junto", () => {
    const v = setupCands();
    v.ev("pointerdown", 25, 25, true);
    v.ev("pointerup", 25, 25, true);
    expect(v.onPickCandidate).toHaveBeenCalledWith(1, true);
    v.ev("pointerdown", 50, 50);
    v.ev("pointerup", 50, 50);
    expect(v.onPickCandidate).toHaveBeenLastCalledWith(0, false);
    expect(v.onBoxCommit).not.toHaveBeenCalled();
  });

  it("arrastar a partir de um candidato desenha uma caixa", () => {
    const v = setupCands();
    v.ev("pointerdown", 25, 25);
    v.ev("pointermove", 45, 45);
    v.ev("pointerup", 45, 45);
    expect(v.onPickCandidate).not.toHaveBeenCalled();
    expect(v.onBoxCommit).toHaveBeenCalledOnce();
  });
});
