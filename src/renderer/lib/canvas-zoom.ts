// src/renderer/lib/canvas-zoom.ts
//
// Zoom do fólio no editor de Recortes. zoom = 1 é "ajustar à largura" do
// contêiner de rolagem; os valores são multiplicadores dessa largura.

export const ZOOM_MIN = 0.25;
export const ZOOM_MAX = 8;
export const ZOOM_FIT = 1;

/** Degraus do controle −/+ e dos atalhos de teclado. */
const ZOOM_STEPS = [0.25, 0.33, 0.5, 0.67, 0.75, 1, 1.25, 1.5, 2, 3, 4, 6, 8] as const;

/** Sensibilidade da roda: 100 px de rolagem ≈ 16% de zoom. */
const WHEEL_SENSITIVITY = 0.0015;

export function clampZoom(zoom: number): number {
  return Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, zoom));
}

/** Zoom após um evento de roda (deltaY < 0 aproxima). Exponencial: subir e descer o mesmo tanto volta ao início. */
export function wheelZoom(zoom: number, deltaY: number, deltaMode: number): number {
  const px = deltaMode === 1 ? deltaY * 16 : deltaMode === 2 ? deltaY * 800 : deltaY;
  return clampZoom(zoom * Math.exp(-px * WHEEL_SENSITIVITY));
}

/** Próximo degrau estritamente maior (dir = 1) ou menor (dir = -1). */
export function stepZoom(zoom: number, dir: 1 | -1): number {
  const eps = 1e-6;
  if (dir === 1) return ZOOM_STEPS.find((s) => s > zoom + eps) ?? ZOOM_MAX;
  return [...ZOOM_STEPS].reverse().find((s) => s < zoom - eps) ?? ZOOM_MIN;
}

export function formatZoom(zoom: number): string {
  return `${Math.round(zoom * 100)}%`;
}

export interface ZoomAnchor {
  /** Posição do cursor (coordenadas de viewport) que deve continuar sobre o mesmo ponto. */
  clientX: number;
  clientY: number;
  /** Fração (0..1) do fólio que estava sob o cursor antes do zoom. */
  fx: number;
  fy: number;
}

/**
 * Rolagem que devolve o ponto `anchor.fx/fy` do fólio para debaixo do cursor,
 * dado o retângulo do fólio já redimensionado (e ainda com a rolagem antiga).
 */
export function anchoredScroll(
  scroll: { scrollLeft: number; scrollTop: number },
  anchor: ZoomAnchor,
  rect: { left: number; top: number; width: number; height: number },
): { scrollLeft: number; scrollTop: number } {
  return {
    scrollLeft: scroll.scrollLeft + (rect.left + anchor.fx * rect.width - anchor.clientX),
    scrollTop: scroll.scrollTop + (rect.top + anchor.fy * rect.height - anchor.clientY),
  };
}

/** Ctrl/Cmd + "=" / "+" aproxima, "-" afasta, "0" ajusta. Alt fica de fora (AltGr em teclados europeus). */
export function isZoomShortcut(
  e: Pick<KeyboardEvent, "key" | "code" | "ctrlKey" | "metaKey" | "altKey">,
): "in" | "out" | "fit" | null {
  if (!(e.ctrlKey || e.metaKey) || e.altKey) return null;
  if (e.key === "=" || e.key === "+" || e.code === "NumpadAdd") return "in";
  if (e.key === "-" || e.key === "_" || e.code === "NumpadSubtract") return "out";
  if (e.key === "0" || e.code === "Digit0" || e.code === "Numpad0") return "fit";
  return null;
}
