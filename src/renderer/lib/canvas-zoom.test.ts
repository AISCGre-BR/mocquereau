import { describe, expect, it } from "vitest";
import {
  ZOOM_FIT,
  ZOOM_MAX,
  ZOOM_MIN,
  anchoredScroll,
  clampZoom,
  formatZoom,
  isZoomShortcut,
  stepZoom,
  wheelZoom,
} from "./canvas-zoom";

describe("canvas-zoom", () => {
  it("clampZoom limita ao intervalo do editor", () => {
    expect(clampZoom(0.01)).toBe(ZOOM_MIN);
    expect(clampZoom(100)).toBe(ZOOM_MAX);
    expect(clampZoom(1.5)).toBe(1.5);
  });

  it("wheelZoom: roda para cima aproxima, para baixo afasta, simétrico", () => {
    const zin = wheelZoom(1, -100, 0);
    const zout = wheelZoom(1, 100, 0);
    expect(zin).toBeGreaterThan(1);
    expect(zout).toBeLessThan(1);
    expect(zin * zout).toBeCloseTo(1, 10);
  });

  it("wheelZoom: deltaMode em linhas pesa como pixels (16 px por linha)", () => {
    expect(wheelZoom(1, -3, 1)).toBeCloseTo(wheelZoom(1, -48, 0), 10);
  });

  it("wheelZoom respeita os limites", () => {
    expect(wheelZoom(ZOOM_MAX, -1000, 0)).toBe(ZOOM_MAX);
    expect(wheelZoom(ZOOM_MIN, 1000, 0)).toBe(ZOOM_MIN);
  });

  it("stepZoom anda pelos degraus e volta a 100% exatamente", () => {
    expect(stepZoom(1, 1)).toBe(1.25);
    expect(stepZoom(1.25, -1)).toBe(1);
    // fora de um degrau (veio da roda): vai para o próximo degrau na direção pedida
    expect(stepZoom(1.1, 1)).toBe(1.25);
    expect(stepZoom(1.1, -1)).toBe(1);
    expect(stepZoom(ZOOM_MAX, 1)).toBe(ZOOM_MAX);
    expect(stepZoom(ZOOM_MIN, -1)).toBe(ZOOM_MIN);
    expect(ZOOM_FIT).toBe(1);
  });

  it("formatZoom mostra porcentagem inteira", () => {
    expect(formatZoom(1)).toBe("100%");
    expect(formatZoom(2.48832)).toBe("249%");
  });

  it("anchoredScroll mantém o ponto da imagem sob o cursor", () => {
    // Antes: wrapper em left=100 (rolado 0), largura 1000; cursor em x=600 → fração 0.5.
    // Depois do zoom 2×: wrapper largura 2000, ainda em left=100 → o ponto 0.5 está em x=1100.
    // Para voltar a x=600, a rolagem tem de andar 500 px.
    const next = anchoredScroll(
      { scrollLeft: 0, scrollTop: 0 },
      { clientX: 600, clientY: 300, fx: 0.5, fy: 0.25 },
      { left: 100, top: 200, width: 2000, height: 800 },
    );
    expect(next.scrollLeft).toBe(500);
    // fy 0.25 de 800 = 200 → y=400; cursor em 300 → anda 100.
    expect(next.scrollTop).toBe(100);
  });

  it("isZoomShortcut reconhece Ctrl/Cmd + = + - 0 (inclusive teclado numérico)", () => {
    const ev = (key: string, mods: Partial<KeyboardEvent> = {}, code = "") =>
      ({ key, code, ctrlKey: false, metaKey: false, altKey: false, ...mods }) as KeyboardEvent;
    expect(isZoomShortcut(ev("=", { ctrlKey: true }))).toBe("in");
    expect(isZoomShortcut(ev("+", { ctrlKey: true, shiftKey: true }))).toBe("in");
    expect(isZoomShortcut(ev("+", { metaKey: true }, "NumpadAdd"))).toBe("in");
    expect(isZoomShortcut(ev("-", { ctrlKey: true }))).toBe("out");
    expect(isZoomShortcut(ev("-", { ctrlKey: true }, "NumpadSubtract"))).toBe("out");
    expect(isZoomShortcut(ev("0", { ctrlKey: true }))).toBe("fit");
    expect(isZoomShortcut(ev("à", { ctrlKey: true }, "Digit0"))).toBe("fit");
    expect(isZoomShortcut(ev("=", {}))).toBeNull();
    expect(isZoomShortcut(ev("=", { ctrlKey: true, altKey: true }))).toBeNull();
    expect(isZoomShortcut(ev("s", { ctrlKey: true }))).toBeNull();
  });
});
