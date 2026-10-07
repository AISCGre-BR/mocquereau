// src/renderer/lib/canvas-rotation.ts
//
// Girar o fólio no editor de Recortes: giros de 90° e ajuste fino ("endireitar")
// relativo ao quarto de volta mais próximo. A rotação é guardada em [0, 360).

import { normalizeRotation } from "./image-adjustments";

/** Faixa do ajuste fino, em graus, em torno do quarto de volta mais próximo. */
export const FINE_MIN = -10;
export const FINE_MAX = 10;
export const FINE_STEP = 0.1;

const round1 = (n: number) => Math.round(n * 10) / 10;

/** Separa a rotação em quarto de volta mais próximo (0/90/180/270) e resto fino em [-45, 45]. */
export function splitRotation(rotation: number): { base: number; fine: number } {
  const r = normalizeRotation(rotation);
  const base = (Math.round(r / 90) * 90) % 360;
  const d = r - base;
  return { base, fine: round1(d > 180 ? d - 360 : d) };
}

/** Rotação resultante de manter o quarto de volta de `rotation` e trocar o resto fino por `fine`. */
export function withFine(rotation: number, fine: number): number {
  return round1(normalizeRotation(splitRotation(rotation).base + fine));
}

/** Soma ±90° à rotação (dir = 1 horário, -1 anti-horário). */
export function rotateQuarter(rotation: number, dir: 1 | -1): number {
  return round1(normalizeRotation(rotation + dir * 90));
}

/** Ctrl/Cmd + "]" gira 90° no sentido horário, "[" no anti-horário. Alt fica de fora (AltGr). */
export function isRotateShortcut(
  e: Pick<KeyboardEvent, "key" | "code" | "ctrlKey" | "metaKey" | "altKey">,
): "cw" | "ccw" | null {
  if (!(e.ctrlKey || e.metaKey) || e.altKey) return null;
  if (e.key === "]" || e.code === "BracketRight") return "cw";
  if (e.key === "[" || e.code === "BracketLeft") return "ccw";
  return null;
}
