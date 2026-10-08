// @vitest-environment jsdom
import "../../i18n";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { SyllableStrip, type SyllableStripProps } from "./SyllableStrip";
import type { ManuscriptLine, SyllabifiedWord } from "../../lib/models";

// Pu-er na-tus est: 5 syllables.
const WORDS: SyllabifiedWord[] = [
  { original: "Puer", syllables: ["Pu", "er"] },
  { original: "natus", syllables: ["na", "tus"] },
  { original: "est", syllables: ["est"] },
];
const BOX = { x: 0.1, y: 0.1, w: 0.2, h: 0.5 };
const IMG = { dataUrl: "data:image/png;base64,iVBORw0KGgo=", width: 100, height: 50, mimeType: "image/png" };

function mkLine(over: Partial<ManuscriptLine> = {}): ManuscriptLine {
  return {
    id: "l1",
    image: IMG,
    syllableRange: { start: 1, end: 3 },
    dividers: [],
    gaps: [],
    syllableBoxes: { 1: BOX, 2: BOX },
    confirmed: true,
    ...over,
  };
}

function mount(over: Partial<SyllableStripProps> = {}) {
  const props: SyllableStripProps = {
    words: WORDS,
    line: mkLine(),
    activeSyllable: 2,
    coveredByOthers: new Map(),
    onActivate: vi.fn(),
    onRangeChange: vi.fn(),
    onToggleGap: vi.fn(),
    onRemoveBox: vi.fn(),
    ...over,
  };
  const utils = render(<SyllableStrip {...props} />);
  const syl = (i: number) => utils.container.querySelector(`[data-syllable="${i}"]`) as HTMLElement;
  const underline = (i: number) => syl(i).querySelector("[data-underline]") as HTMLElement | null;
  return { ...utils, props, syl, underline };
}

beforeEach(() => {
  Element.prototype.scrollIntoView = vi.fn();
  // Syllable i occupies [40i, 40i + 30] horizontally.
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (this: HTMLElement) {
    const i = Number(this.dataset.syllable ?? 0);
    const left = i * 40;
    return { left, right: left + 30, width: 30, top: 0, bottom: 20, height: 20, x: left, y: 0, toJSON() {} } as DOMRect;
  });
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("SyllableStrip: estados", () => {
  it("com caixa, ativa, sem caixa, fora do intervalo e gap", () => {
    const v = mount({ line: mkLine({ syllableRange: { start: 1, end: 4 }, gaps: [4], syllableBoxes: { 1: BOX, 2: BOX, 4: BOX } }) });
    // Fora do intervalo.
    expect(v.syl(0).className).toContain("opacity-40");
    // Com caixa: traço no pigmento da sílaba.
    expect(v.underline(1)!.className).toContain("sc-pig-orpiment");
    expect(v.syl(1).className).not.toContain("text-ink-muted");
    // Ativa: itálico, wash e traço em rubric.
    expect(v.syl(2).className).toContain("italic");
    expect(v.syl(2).className).toContain("bg-rubric-wash");
    expect(v.syl(2).className).toContain("text-rubric");
    expect(v.underline(2)!.className).toContain("bg-rubric");
    // Sem caixa dentro do intervalo.
    expect(v.syl(3).className).toContain("text-ink-muted");
    expect(v.underline(3)).toBeNull();
    // Gap: tracejado no lugar do pigmento.
    expect(v.underline(4)!.className).toContain("border-dashed");
    expect(v.underline(4)!.className).not.toContain("sc-pig");
  });

  it("coberta por outra página: 40%, cursor padrão, inerte, e o tooltip mostra o fólio", () => {
    vi.useFakeTimers();
    try {
      const v = mount({ coveredByOthers: new Map([[0, "12r"]]) });
      expect(v.syl(0).className).toContain("opacity-40");
      expect(v.syl(0).className).toContain("cursor-default");
      fireEvent.click(v.syl(0));
      expect(v.props.onActivate).not.toHaveBeenCalled();
      expect(v.props.onRangeChange).not.toHaveBeenCalled();
      fireEvent.mouseEnter(v.syl(0));
      act(() => void vi.advanceTimersByTime(600));
      expect(screen.getByRole("tooltip").textContent).toContain("12r");
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("SyllableStrip: coberta dentro do intervalo", () => {
  it("mostra o sinal de coberta (40% e fólio) mas continua clicável", () => {
    vi.useFakeTimers();
    try {
      const v = mount({ coveredByOthers: new Map([[1, "12v"]]) });
      expect(v.syl(1).className).toContain("opacity-40");
      expect(v.syl(1).className).toContain("cursor-pointer");
      fireEvent.click(v.syl(1));
      expect(v.props.onActivate).toHaveBeenCalledWith(1);
      fireEvent.contextMenu(v.syl(1));
      expect(screen.getByRole("menu")).toBeTruthy();
      fireEvent.mouseEnter(v.syl(1));
      act(() => void vi.advanceTimersByTime(600));
      expect(screen.getByRole("tooltip").textContent).toContain("12v");
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("SyllableStrip: teclado nas sílabas", () => {
  it("é uma parada de Tab só, na sílaba ativa", () => {
    const v = mount();
    const stops = Array.from(v.container.querySelectorAll("[data-syllable]")).filter((el) => (el as HTMLElement).tabIndex === 0);
    expect(stops).toEqual([v.syl(2)]);
  });

  it("setas movem o foco, Enter ativa (e estende fora do intervalo), sem chegar à janela", () => {
    const v = mount();
    const winKey = vi.fn();
    window.addEventListener("keydown", winKey);
    try {
      act(() => v.syl(2).focus());
      fireEvent.keyDown(v.syl(2), { key: "ArrowRight" });
      expect(document.activeElement).toBe(v.syl(3));
      expect(v.syl(3).tabIndex).toBe(0);
      fireEvent.keyDown(v.syl(3), { key: "ArrowRight" });
      fireEvent.keyDown(v.syl(4), { key: "Enter" });
      expect(v.props.onRangeChange).toHaveBeenCalledWith({ start: 1, end: 4 });
      expect(v.props.onActivate).toHaveBeenCalledWith(4);
      fireEvent.keyDown(v.syl(4), { key: "ArrowLeft" });
      expect(document.activeElement).toBe(v.syl(3));
      expect(winKey).not.toHaveBeenCalled();
    } finally {
      window.removeEventListener("keydown", winKey);
    }
  });

  it("Shift+F10 e a tecla de menu abrem o menu da sílaba sob ela", () => {
    const v = mount();
    fireEvent.keyDown(v.syl(2), { key: "F10", shiftKey: true });
    const menu = screen.getByRole("menu");
    expect(menu.style.left).toBe("80px"); // getBoundingClientRect of syllable 2
    expect(menu.style.top).toBe("20px");
    fireEvent.keyDown(menu, { key: "Escape" });
    expect(screen.queryByRole("menu")).toBeNull();
    fireEvent.keyDown(v.syl(3), { key: "ContextMenu" });
    fireEvent.click(screen.getByRole("menuitemcheckbox", { name: "Sem neuma nesta página" }));
    expect(v.props.onToggleGap).toHaveBeenCalledWith(3);
  });

  it("clicar com o mouse não tira o foco do editor", () => {
    const v = mount();
    expect(fireEvent.mouseDown(v.syl(3))).toBe(false);
  });
});

describe("SyllableStrip: clique", () => {
  it("dentro do intervalo só ativa", () => {
    const v = mount();
    fireEvent.click(v.syl(3));
    expect(v.props.onActivate).toHaveBeenCalledWith(3);
    expect(v.props.onRangeChange).not.toHaveBeenCalled();
  });

  it("fora do intervalo estende até ela e ativa", () => {
    const v = mount();
    fireEvent.click(v.syl(4));
    expect(v.props.onRangeChange).toHaveBeenCalledWith({ start: 1, end: 4 });
    expect(v.props.onActivate).toHaveBeenCalledWith(4);
    fireEvent.click(v.syl(0));
    expect(v.props.onRangeChange).toHaveBeenLastCalledWith({ start: 0, end: 3 });
  });
});

describe("SyllableStrip: alças", () => {
  function drag(handle: HTMLElement, xs: number[]) {
    act(() => void fireEvent.pointerDown(handle, { button: 0, clientX: 0 }));
    for (const x of xs) act(() => void window.dispatchEvent(new MouseEvent("pointermove", { clientX: x })));
    act(() => void window.dispatchEvent(new MouseEvent("pointerup", {})));
  }

  it("arrastar a alça do fim para antes do início para no início", () => {
    const v = mount();
    drag(screen.getByRole("slider", { name: "Fim do intervalo da página" }), [5]);
    expect(v.props.onRangeChange).toHaveBeenLastCalledWith({ start: 1, end: 1 });
  });

  it("arrastar ajusta sílaba a sílaba", () => {
    const v = mount();
    drag(screen.getByRole("slider", { name: "Fim do intervalo da página" }), [100]);
    expect(v.props.onRangeChange).toHaveBeenLastCalledWith({ start: 1, end: 2 });
    drag(screen.getByRole("slider", { name: "Início do intervalo da página" }), [5]);
    expect(v.props.onRangeChange).toHaveBeenLastCalledWith({ start: 0, end: 3 });
    // Depois do pointerup, mover não muda mais nada.
    const calls = vi.mocked(v.props.onRangeChange).mock.calls.length;
    act(() => void window.dispatchEvent(new MouseEvent("pointermove", { clientX: 200 })));
    expect(vi.mocked(v.props.onRangeChange).mock.calls.length).toBe(calls);
  });

  it("setas na alça ajustam sem cruzar a outra", () => {
    const v = mount();
    const end = screen.getByRole("slider", { name: "Fim do intervalo da página" });
    const start = screen.getByRole("slider", { name: "Início do intervalo da página" });
    expect(end.getAttribute("aria-valuenow")).toBe("3");
    fireEvent.keyDown(end, { key: "ArrowRight" });
    expect(v.props.onRangeChange).toHaveBeenLastCalledWith({ start: 1, end: 4 });
    fireEvent.keyDown(start, { key: "ArrowLeft" });
    expect(v.props.onRangeChange).toHaveBeenLastCalledWith({ start: 0, end: 3 });
    vi.mocked(v.props.onRangeChange).mockClear();
    v.rerender(<SyllableStrip {...v.props} line={mkLine({ syllableRange: { start: 2, end: 2 } })} />);
    fireEvent.keyDown(screen.getByRole("slider", { name: "Fim do intervalo da página" }), { key: "ArrowLeft" });
    fireEvent.keyDown(screen.getByRole("slider", { name: "Início do intervalo da página" }), { key: "ArrowRight" });
    expect(v.props.onRangeChange).not.toHaveBeenCalled();
  });
});

describe("SyllableStrip: menu de contexto", () => {
  it("alterna o gap e remove a caixa", () => {
    const v = mount();
    fireEvent.contextMenu(v.syl(2));
    const gap = screen.getByRole("menuitemcheckbox", { name: "Sem neuma nesta página" });
    expect(gap.getAttribute("aria-checked")).toBe("false");
    fireEvent.click(gap);
    expect(v.props.onToggleGap).toHaveBeenCalledWith(2);
    expect(screen.queryByRole("menu")).toBeNull();

    fireEvent.contextMenu(v.syl(2));
    fireEvent.click(screen.getByRole("menuitem", { name: "Remover caixa" }));
    expect(v.props.onRemoveBox).toHaveBeenCalledWith(2);
  });

  it("sem caixa, não oferece remover", () => {
    const v = mount();
    fireEvent.contextMenu(v.syl(3));
    expect(screen.queryByRole("menuitem", { name: "Remover caixa" })).toBeNull();
  });
});

describe("SyllableStrip: rolagem", () => {
  it("rola até a sílaba ativa", () => {
    const v = mount({ activeSyllable: 3 });
    expect(vi.mocked(Element.prototype.scrollIntoView).mock.contexts).toContain(v.syl(3));
  });
});
