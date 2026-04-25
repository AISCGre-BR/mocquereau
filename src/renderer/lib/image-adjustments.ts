// src/renderer/lib/image-adjustments.ts
//
// Helpers puros para traduzir `ImageAdjustments` (Phase 10 / IMG-06) em
// strings CSS (filter + transform) e para converter coordenadas entre o
// espaço canônico da imagem original e o espaço visual (pós-rotação/flip).
//
// Zero DOM, zero React — só matemática. Consumido por ImageCanvas (SliceEditor),
// ImageAdjustmentsPanel e TableCell.
import type { ImageAdjustments, SyllableBox } from "./models";

/** Valor "sem ajuste" — igual byte-a-byte a um projeto v0.0.3 sem o campo. */
export const IMAGE_ADJUSTMENTS_DEFAULT: ImageAdjustments = {
  brightness: 100,
  contrast: 100,
  saturation: 100,
  grayscale: 0,
  invert: false,
  rotation: 0,
  flipH: false,
  flipV: false,
};

/**
 * Normaliza um ângulo em graus para o range canônico [0, 360).
 * Aceita qualquer number (incluindo negativos, > 360, decimais).
 * Trata `NaN`/`Infinity` retornando `0` (defensivo contra projetos
 * editados manualmente / valores corrompidos). Phase 11 / IMG-07.
 *
 * Exemplos:
 *   normalizeRotation(0)        === 0
 *   normalizeRotation(90)       === 90
 *   normalizeRotation(360)      === 0
 *   normalizeRotation(-90)      === 270
 *   normalizeRotation(720)      === 0
 *   normalizeRotation(17.5)     === 17.5
 *   normalizeRotation(NaN)      === 0
 *   normalizeRotation(Infinity) === 0
 */
export function normalizeRotation(deg: number): number {
  if (!Number.isFinite(deg)) return 0;
  return ((deg % 360) + 360) % 360;
}

/** True se o ajuste é indistinguível do default (ou undefined). */
export function isDefaultAdjustments(adj?: ImageAdjustments): boolean {
  if (!adj) return true;
  return (
    adj.brightness === 100 &&
    adj.contrast === 100 &&
    adj.saturation === 100 &&
    adj.grayscale === 0 &&
    adj.invert === false &&
    adj.rotation === 0 &&
    adj.flipH === false &&
    adj.flipV === false
  );
}

function isDefaultColor(adj: ImageAdjustments): boolean {
  return (
    adj.brightness === 100 &&
    adj.contrast === 100 &&
    adj.saturation === 100 &&
    adj.grayscale === 0 &&
    adj.invert === false
  );
}

function isDefaultGeometry(adj: ImageAdjustments): boolean {
  return adj.rotation === 0 && !adj.flipH && !adj.flipV;
}

/**
 * Retorna a string `filter` CSS equivalente, ou `undefined` se todos os campos
 * de cor estão no default (para não poluir o DOM com `filter: none` triviais).
 * Formato: `"brightness(X%) contrast(Y%) saturate(Z%) grayscale(G%) invert(I)"`.
 */
export function buildImageFilter(adj?: ImageAdjustments): string | undefined {
  if (!adj || isDefaultColor(adj)) return undefined;
  return (
    `brightness(${adj.brightness}%) ` +
    `contrast(${adj.contrast}%) ` +
    `saturate(${adj.saturation}%) ` +
    `grayscale(${adj.grayscale}%) ` +
    `invert(${adj.invert ? 1 : 0})`
  );
}

/**
 * Retorna a string `transform` CSS equivalente, ou `undefined` se geometria
 * está no default. Formato: `"rotate(Rdeg) scaleX(±1) scaleY(±1)"`.
 */
export function buildImageTransform(adj?: ImageAdjustments): string | undefined {
  if (!adj || isDefaultGeometry(adj)) return undefined;
  const sx = adj.flipH ? -1 : 1;
  const sy = adj.flipV ? -1 : 1;
  return `rotate(${adj.rotation}deg) scaleX(${sx}) scaleY(${sy})`;
}

// ── Geometric transforms in the unit square [0,1]x[0,1] ──────────────────────
// Ordem (forward / apply): point canônico -> point visual
//   1) flipH (x' = 1 - x)
//   2) flipV (y' = 1 - y)
//   3) rotate(rotation deg) clockwise em CSS coords (y-down), em torno de (0.5, 0.5)
// Inversa desfaz na ordem reversa: primeiro rotação inversa, depois flips
// (flips são involuções, então `flipH/flipV` se aplicam novamente com o mesmo
// sinal).

function applyFlip(
  p: { xFrac: number; yFrac: number },
  flipH: boolean,
  flipV: boolean,
): { xFrac: number; yFrac: number } {
  return {
    xFrac: flipH ? 1 - p.xFrac : p.xFrac,
    yFrac: flipV ? 1 - p.yFrac : p.yFrac,
  };
}

function rotatePointCw(
  p: { xFrac: number; yFrac: number },
  deg: number,
): { xFrac: number; yFrac: number } {
  // Rotação horária em CSS coords (y-down) em torno de (0.5, 0.5).
  // Phase 11 / Plan 2: implementação trigonométrica geral via Math.cos/sin.
  // Para qualquer θ ∈ ℝ — após `normalizeRotation`, θ ∈ [0, 360).
  //
  // Fórmula matricial CW em y-down (equivalente a CCW em y-up):
  //   [x' - 0.5]   [ cos θ  -sin θ ] [x - 0.5]
  //   [y' - 0.5] = [ sin θ   cos θ ] [y - 0.5]
  //
  // Cardinais byte-idênticos via álgebra (não via switch):
  //   90°  → cos=0, sin=1  → (0.5 - dy, 0.5 + dx)  ≡ (1-y, x)
  //   180° → cos=-1, sin=0 → (0.5 - dx, 0.5 - dy)  ≡ (1-x, 1-y)
  //   270° → cos=0, sin=-1 → (0.5 + dy, 0.5 - dx)  ≡ (y,   1-x)
  const n = normalizeRotation(deg);
  if (n === 0) return { xFrac: p.xFrac, yFrac: p.yFrac };
  const rad = (n * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  const dx = p.xFrac - 0.5;
  const dy = p.yFrac - 0.5;
  return {
    xFrac: 0.5 + dx * cos - dy * sin,
    yFrac: 0.5 + dx * sin + dy * cos,
  };
}

/**
 * Retorna o ângulo θ' tal que rotate(θ') desfaz rotate(θ): θ' = -θ mod 360.
 * Para qualquer θ ∈ ℝ. Usado por invertGeometricTransform.
 */
function inverseRotationDeg(deg: number): number {
  return normalizeRotation(-deg);
}

/**
 * Dado um `SyllableBox` em coords canônicas, retorna o bounding box
 * AABB axis-aligned do quadrilátero resultante após flip + rotação.
 *
 * Para múltiplos de 90°: rotação preserva axis-alignment, AABB === quadrilátero
 * rotacionado (caso da Phase 10).
 *
 * Para ângulos não-cardinais (ex: 45°): o quadrilátero rotacionado NÃO é
 * axis-aligned; o AABB retornado é maior que o box original (cresce ~√2× para
 * 45°). Isso é intencional — a função é usada principalmente em testes de
 * invariância e em lookup de bounding region; consumidores que precisem das
 * coords exatas devem aplicar `rotatePointCw` aos 4 cantos diretamente.
 *
 * Phase 11 / IMG-07: generalizado para qualquer θ ∈ ℝ.
 */
export function applyGeometricTransform(
  box: SyllableBox,
  adj?: ImageAdjustments,
): SyllableBox {
  if (!adj || isDefaultGeometry(adj)) return box;
  const corners = [
    { xFrac: box.x, yFrac: box.y },
    { xFrac: box.x + box.w, yFrac: box.y },
    { xFrac: box.x, yFrac: box.y + box.h },
    { xFrac: box.x + box.w, yFrac: box.y + box.h },
  ]
    .map((p) => applyFlip(p, adj.flipH, adj.flipV))
    .map((p) => rotatePointCw(p, adj.rotation));
  const xs = corners.map((c) => c.xFrac);
  const ys = corners.map((c) => c.yFrac);
  const minX = Math.min(...xs);
  const minY = Math.min(...ys);
  const maxX = Math.max(...xs);
  const maxY = Math.max(...ys);
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
}

/**
 * Dado um ponto VISUAL (fração [0,1]x[0,1] no espaço pós-transform), retorna
 * o ponto CANÔNICO correspondente. Para qualquer θ ∈ ℝ — usa rotação inversa
 * via seno/cosseno em torno de (0.5, 0.5). Phase 11 / IMG-07.
 *
 * Usado pelos pointer handlers do ImageCanvas para gravar boxes em coords da
 * imagem original mesmo quando rotação/flip estão ativos.
 */
export function invertGeometricTransform(
  point: { xFrac: number; yFrac: number },
  adj?: ImageAdjustments,
): { xFrac: number; yFrac: number } {
  if (!adj || isDefaultGeometry(adj)) return point;
  // Inversa: rotação inversa primeiro, depois flip (involuções).
  const rotated = rotatePointCw(point, inverseRotationDeg(adj.rotation));
  return applyFlip(rotated, adj.flipH, adj.flipV);
}
