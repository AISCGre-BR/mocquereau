// src/renderer/lib/image-adjustments.test.ts
//
// Testes exaustivos para os helpers de Phase 10 / IMG-06.
// Inclui round-trip invariant `invert ∘ apply = identity` para as 16
// combinações (rotation × flipH × flipV) em 5 sample points.
import { describe, it, expect } from "vitest";
import type { ImageAdjustments, SyllableBox } from "./models";
import {
  IMAGE_ADJUSTMENTS_DEFAULT,
  isDefaultAdjustments,
  buildImageFilter,
  buildImageTransform,
  applyGeometricTransform,
  invertGeometricTransform,
  normalizeRotation,
} from "./image-adjustments";

const TOL = 9; // casas decimais para toBeCloseTo (≈ 1e-9)

/**
 * Aplica a transformação geométrica a um ponto (em vez de um box) usando
 * um box degenerado w=h=0, que retorna x/y já transformados.
 */
function applyPointForTest(
  pt: { xFrac: number; yFrac: number },
  adj: ImageAdjustments,
): { xFrac: number; yFrac: number } {
  const out = applyGeometricTransform(
    { x: pt.xFrac, y: pt.yFrac, w: 0, h: 0 },
    adj,
  );
  return { xFrac: out.x, yFrac: out.y };
}

describe("isDefaultAdjustments", () => {
  it("retorna true para undefined", () => {
    expect(isDefaultAdjustments(undefined)).toBe(true);
  });
  it("retorna true para valor all-default", () => {
    expect(isDefaultAdjustments(IMAGE_ADJUSTMENTS_DEFAULT)).toBe(true);
  });
  it("retorna true para cópia all-default", () => {
    expect(isDefaultAdjustments({ ...IMAGE_ADJUSTMENTS_DEFAULT })).toBe(true);
  });
  it("retorna false se brightness diferente", () => {
    expect(
      isDefaultAdjustments({ ...IMAGE_ADJUSTMENTS_DEFAULT, brightness: 150 }),
    ).toBe(false);
  });
  it("retorna false se contrast diferente", () => {
    expect(
      isDefaultAdjustments({ ...IMAGE_ADJUSTMENTS_DEFAULT, contrast: 80 }),
    ).toBe(false);
  });
  it("retorna false se saturation diferente", () => {
    expect(
      isDefaultAdjustments({ ...IMAGE_ADJUSTMENTS_DEFAULT, saturation: 0 }),
    ).toBe(false);
  });
  it("retorna false se grayscale diferente", () => {
    expect(
      isDefaultAdjustments({ ...IMAGE_ADJUSTMENTS_DEFAULT, grayscale: 50 }),
    ).toBe(false);
  });
  it("retorna false se invert=true", () => {
    expect(
      isDefaultAdjustments({ ...IMAGE_ADJUSTMENTS_DEFAULT, invert: true }),
    ).toBe(false);
  });
  it("retorna false se rotation=90", () => {
    expect(
      isDefaultAdjustments({ ...IMAGE_ADJUSTMENTS_DEFAULT, rotation: 90 }),
    ).toBe(false);
  });
  it("retorna false se flipH=true", () => {
    expect(
      isDefaultAdjustments({ ...IMAGE_ADJUSTMENTS_DEFAULT, flipH: true }),
    ).toBe(false);
  });
  it("retorna false se flipV=true", () => {
    expect(
      isDefaultAdjustments({ ...IMAGE_ADJUSTMENTS_DEFAULT, flipV: true }),
    ).toBe(false);
  });
});

describe("normalizeRotation", () => {
  it("identidade para 0", () => {
    expect(normalizeRotation(0)).toBe(0);
  });
  it("preserva múltiplos de 90 (90/180/270)", () => {
    expect(normalizeRotation(90)).toBe(90);
    expect(normalizeRotation(180)).toBe(180);
    expect(normalizeRotation(270)).toBe(270);
  });
  it("360 → 0", () => {
    expect(normalizeRotation(360)).toBe(0);
  });
  it("720 → 0", () => {
    expect(normalizeRotation(720)).toBe(0);
  });
  it("-90 → 270", () => {
    expect(normalizeRotation(-90)).toBe(270);
  });
  it("-180 → 180", () => {
    expect(normalizeRotation(-180)).toBe(180);
  });
  it("preserva decimais ∈ [0, 360)", () => {
    expect(normalizeRotation(17.5)).toBeCloseTo(17.5, 9);
    expect(normalizeRotation(142.5)).toBeCloseTo(142.5, 9);
    expect(normalizeRotation(359.5)).toBeCloseTo(359.5, 9);
  });
  it("decimal > 360 → mod 360", () => {
    expect(normalizeRotation(720.5)).toBeCloseTo(0.5, 9);
  });
  it("NaN → 0", () => {
    expect(normalizeRotation(NaN)).toBe(0);
  });
  it("Infinity → 0", () => {
    expect(normalizeRotation(Infinity)).toBe(0);
  });
  it("-Infinity → 0", () => {
    expect(normalizeRotation(-Infinity)).toBe(0);
  });
});

describe("buildImageFilter", () => {
  it("retorna undefined para undefined", () => {
    expect(buildImageFilter(undefined)).toBeUndefined();
  });
  it("retorna undefined para all-default", () => {
    expect(buildImageFilter(IMAGE_ADJUSTMENTS_DEFAULT)).toBeUndefined();
  });
  it("retorna undefined quando só geometria está alterada (cor default)", () => {
    expect(
      buildImageFilter({
        ...IMAGE_ADJUSTMENTS_DEFAULT,
        rotation: 90,
        flipH: true,
      }),
    ).toBeUndefined();
  });
  it("começa com brightness quando brightness=150", () => {
    const s = buildImageFilter({ ...IMAGE_ADJUSTMENTS_DEFAULT, brightness: 150 });
    expect(s).toBeDefined();
    expect(s!.startsWith("brightness(150%)")).toBe(true);
  });
  it("inclui invert(1) quando invert=true", () => {
    const s = buildImageFilter({ ...IMAGE_ADJUSTMENTS_DEFAULT, invert: true });
    expect(s).toBeDefined();
    expect(s).toContain("invert(1)");
  });
  it("inclui invert(0) quando invert=false (mas outra cor mudou)", () => {
    const s = buildImageFilter({ ...IMAGE_ADJUSTMENTS_DEFAULT, contrast: 120 });
    expect(s).toBeDefined();
    expect(s).toContain("invert(0)");
  });
  it("contém os 5 componentes quando qualquer cor muda", () => {
    const s = buildImageFilter({ ...IMAGE_ADJUSTMENTS_DEFAULT, grayscale: 50 })!;
    expect(s).toContain("brightness(100%)");
    expect(s).toContain("contrast(100%)");
    expect(s).toContain("saturate(100%)");
    expect(s).toContain("grayscale(50%)");
    expect(s).toContain("invert(0)");
  });
});

describe("buildImageTransform", () => {
  it("retorna undefined para undefined", () => {
    expect(buildImageTransform(undefined)).toBeUndefined();
  });
  it("retorna undefined para all-default", () => {
    expect(buildImageTransform(IMAGE_ADJUSTMENTS_DEFAULT)).toBeUndefined();
  });
  it("retorna undefined quando só cor mudou (geometria default)", () => {
    expect(
      buildImageTransform({
        ...IMAGE_ADJUSTMENTS_DEFAULT,
        brightness: 150,
        invert: true,
      }),
    ).toBeUndefined();
  });
  it("retorna rotate(90deg) scaleX(1) scaleY(1) para rotation=90", () => {
    expect(
      buildImageTransform({ ...IMAGE_ADJUSTMENTS_DEFAULT, rotation: 90 }),
    ).toBe("rotate(90deg) scaleX(1) scaleY(1)");
  });
  it("usa scaleX(-1) para flipH=true", () => {
    const s = buildImageTransform({ ...IMAGE_ADJUSTMENTS_DEFAULT, flipH: true })!;
    expect(s).toContain("scaleX(-1)");
    expect(s).toContain("scaleY(1)");
  });
  it("usa scaleY(-1) para flipV=true", () => {
    const s = buildImageTransform({ ...IMAGE_ADJUSTMENTS_DEFAULT, flipV: true })!;
    expect(s).toContain("scaleY(-1)");
    expect(s).toContain("scaleX(1)");
  });
  it("combina rotation=180 + flipH corretamente", () => {
    const s = buildImageTransform({
      ...IMAGE_ADJUSTMENTS_DEFAULT,
      rotation: 180,
      flipH: true,
    })!;
    expect(s).toContain("rotate(180deg)");
    expect(s).toContain("scaleX(-1)");
    expect(s).toContain("scaleY(1)");
  });
  it("mantém ordem consistente rotate → scaleX → scaleY", () => {
    const s = buildImageTransform({
      ...IMAGE_ADJUSTMENTS_DEFAULT,
      rotation: 270,
      flipH: true,
      flipV: true,
    })!;
    expect(s).toBe("rotate(270deg) scaleX(-1) scaleY(-1)");
  });
});

describe("applyGeometricTransform (box)", () => {
  it("é identidade para default", () => {
    const box: SyllableBox = { x: 0.1, y: 0.2, w: 0.3, h: 0.4 };
    expect(applyGeometricTransform(box, IMAGE_ADJUSTMENTS_DEFAULT)).toEqual(box);
  });
  it("é identidade para undefined", () => {
    const box: SyllableBox = { x: 0.1, y: 0.2, w: 0.3, h: 0.4 };
    expect(applyGeometricTransform(box, undefined)).toEqual(box);
  });
  it("rotation=90 troca w/h (horizontal → vertical)", () => {
    const box: SyllableBox = { x: 0, y: 0, w: 0.5, h: 0.2 };
    const out = applyGeometricTransform(box, {
      ...IMAGE_ADJUSTMENTS_DEFAULT,
      rotation: 90,
    });
    expect(out.w).toBeCloseTo(0.2, TOL);
    expect(out.h).toBeCloseTo(0.5, TOL);
  });
  it("rotation=180 preserva w/h mas espelha posição", () => {
    const box: SyllableBox = { x: 0.1, y: 0.2, w: 0.3, h: 0.4 };
    const out = applyGeometricTransform(box, {
      ...IMAGE_ADJUSTMENTS_DEFAULT,
      rotation: 180,
    });
    expect(out.w).toBeCloseTo(0.3, TOL);
    expect(out.h).toBeCloseTo(0.4, TOL);
    // canto (0.1, 0.2) passa a (1 - 0.1 - 0.3, 1 - 0.2 - 0.4) = (0.6, 0.4)
    expect(out.x).toBeCloseTo(0.6, TOL);
    expect(out.y).toBeCloseTo(0.4, TOL);
  });
  it("flipH espelha horizontalmente mantendo dimensões", () => {
    const box: SyllableBox = { x: 0.1, y: 0.2, w: 0.3, h: 0.4 };
    const out = applyGeometricTransform(box, {
      ...IMAGE_ADJUSTMENTS_DEFAULT,
      flipH: true,
    });
    expect(out.w).toBeCloseTo(0.3, TOL);
    expect(out.h).toBeCloseTo(0.4, TOL);
    expect(out.x).toBeCloseTo(1 - 0.1 - 0.3, TOL); // 0.6
    expect(out.y).toBeCloseTo(0.2, TOL);
  });
});

describe("invertGeometricTransform (point)", () => {
  it("é identidade para default", () => {
    const pt = { xFrac: 0.3, yFrac: 0.7 };
    expect(invertGeometricTransform(pt, IMAGE_ADJUSTMENTS_DEFAULT)).toEqual(pt);
  });
  it("é identidade para undefined", () => {
    const pt = { xFrac: 0.3, yFrac: 0.7 };
    expect(invertGeometricTransform(pt, undefined)).toEqual(pt);
  });
});

describe("round-trip: invertGeometricTransform ∘ applyPoint = identity (16 combos)", () => {
  const rotations: Array<0 | 90 | 180 | 270> = [0, 90, 180, 270];
  const flips = [false, true];
  const samples: Array<{ xFrac: number; yFrac: number }> = [
    { xFrac: 0, yFrac: 0 },
    { xFrac: 1, yFrac: 1 },
    { xFrac: 0.5, yFrac: 0.5 },
    { xFrac: 0.3, yFrac: 0.7 },
    { xFrac: 0.25, yFrac: 0.8 },
  ];
  for (const rotation of rotations) {
    for (const flipH of flips) {
      for (const flipV of flips) {
        const adj: ImageAdjustments = {
          ...IMAGE_ADJUSTMENTS_DEFAULT,
          rotation,
          flipH,
          flipV,
        };
        it(`rotation=${rotation} flipH=${flipH} flipV=${flipV}`, () => {
          for (const pt of samples) {
            const visual = applyPointForTest(pt, adj);
            const back = invertGeometricTransform(visual, adj);
            expect(back.xFrac).toBeCloseTo(pt.xFrac, TOL);
            expect(back.yFrac).toBeCloseTo(pt.yFrac, TOL);
          }
        });
      }
    }
  }
});

describe("round-trip: applyPoint ∘ invertGeometricTransform = identity (reverse direction)", () => {
  // Sanidade adicional: a direção reversa (partir de visual, passar pelo
  // invert, reaplicar) também deve fechar.
  const rotations: Array<0 | 90 | 180 | 270> = [0, 90, 180, 270];
  const flips = [false, true];
  const samples: Array<{ xFrac: number; yFrac: number }> = [
    { xFrac: 0.2, yFrac: 0.9 },
    { xFrac: 0.75, yFrac: 0.15 },
  ];
  for (const rotation of rotations) {
    for (const flipH of flips) {
      for (const flipV of flips) {
        const adj: ImageAdjustments = {
          ...IMAGE_ADJUSTMENTS_DEFAULT,
          rotation,
          flipH,
          flipV,
        };
        it(`reverse rotation=${rotation} flipH=${flipH} flipV=${flipV}`, () => {
          for (const visual of samples) {
            const canonical = invertGeometricTransform(visual, adj);
            const forward = applyPointForTest(canonical, adj);
            expect(forward.xFrac).toBeCloseTo(visual.xFrac, TOL);
            expect(forward.yFrac).toBeCloseTo(visual.yFrac, TOL);
          }
        });
      }
    }
  }
});

describe("round-trip: non-cardinal angles preserve points", () => {
  const angles = [17, 142.5, 273, 0.5, 359.5];
  const flips = [false, true];
  const samples: Array<{ xFrac: number; yFrac: number }> = [
    { xFrac: 0.5, yFrac: 0.5 }, // centro: ponto fixo
    { xFrac: 0.3, yFrac: 0.7 },
    { xFrac: 0.1, yFrac: 0.2 },
    { xFrac: 0.9, yFrac: 0.8 },
    { xFrac: 0.25, yFrac: 0.5 },
  ];
  const TOL_NONCARDINAL = 9; // 1e-9, mesma tolerância dos cardinais — sin/cos em IEEE-754
  for (const rotation of angles) {
    for (const flipH of flips) {
      for (const flipV of flips) {
        const adj: ImageAdjustments = {
          ...IMAGE_ADJUSTMENTS_DEFAULT,
          rotation,
          flipH,
          flipV,
        };
        it(`rotation=${rotation} flipH=${flipH} flipV=${flipV}`, () => {
          for (const pt of samples) {
            const visual = applyPointForTest(pt, adj);
            const back = invertGeometricTransform(visual, adj);
            expect(back.xFrac).toBeCloseTo(pt.xFrac, TOL_NONCARDINAL);
            expect(back.yFrac).toBeCloseTo(pt.yFrac, TOL_NONCARDINAL);
          }
        });
      }
    }
  }
});

describe("applyGeometricTransform AABB growth for non-cardinal angles", () => {
  it("rotation=45 cresce o AABB de um quadrado centrado por ~√2", () => {
    // Box 0.4 × 0.4 centrado em (0.5, 0.5): canto NW (0.3, 0.3), SE (0.7, 0.7)
    const box: SyllableBox = { x: 0.3, y: 0.3, w: 0.4, h: 0.4 };
    const out = applyGeometricTransform(box, {
      ...IMAGE_ADJUSTMENTS_DEFAULT,
      rotation: 45,
    });
    // Após rotação 45° em torno do centro: diagonal vira lado, AABB tem lado = 0.4·√2
    const expected = 0.4 * Math.SQRT2;
    expect(out.w).toBeCloseTo(expected, 9);
    expect(out.h).toBeCloseTo(expected, 9);
    // Centro permanece (0.5, 0.5)
    expect(out.x + out.w / 2).toBeCloseTo(0.5, 9);
    expect(out.y + out.h / 2).toBeCloseTo(0.5, 9);
  });
  it("rotation=360.5 é equivalente a rotation=0.5 (idempotência mod 360)", () => {
    // applyGeometricTransform delega a rotatePointCw, que normaliza via
    // normalizeRotation. Verifica que rotation=360.5 produz mesmo resultado
    // que rotation=0.5.
    const box: SyllableBox = { x: 0.2, y: 0.2, w: 0.3, h: 0.3 };
    const a = applyGeometricTransform(box, {
      ...IMAGE_ADJUSTMENTS_DEFAULT,
      rotation: 360.5,
    });
    const b = applyGeometricTransform(box, {
      ...IMAGE_ADJUSTMENTS_DEFAULT,
      rotation: 0.5,
    });
    expect(a.x).toBeCloseTo(b.x, 9);
    expect(a.y).toBeCloseTo(b.y, 9);
    expect(a.w).toBeCloseTo(b.w, 9);
    expect(a.h).toBeCloseTo(b.h, 9);
  });
  it("rotation=17 com flipH é diferente de rotation=17 sem flip (verifica ordem flip → rotate)", () => {
    // Sanidade: a ordem importa em geral; AABBs com mesmas dimensões mas
    // posições diferentes para flipH:true vs false.
    const box: SyllableBox = { x: 0.1, y: 0.4, w: 0.2, h: 0.2 };
    const withFlipThenRotate = applyGeometricTransform(box, {
      ...IMAGE_ADJUSTMENTS_DEFAULT,
      rotation: 17,
      flipH: true,
    });
    const rotateNegative = applyGeometricTransform(box, {
      ...IMAGE_ADJUSTMENTS_DEFAULT,
      rotation: -17,
    });
    // AABBs podem ter mesmas dimensões (rotação não-cardinal de mesmo |θ|)
    // mas posição (x, y) tipicamente diferente.
    expect(withFlipThenRotate.w).toBeCloseTo(rotateNegative.w, 9);
    expect(withFlipThenRotate.h).toBeCloseTo(rotateNegative.h, 9);
    // Verificar que flipH mudou a posição em relação a um rotation=17 sem flip.
    const original = applyGeometricTransform(box, {
      ...IMAGE_ADJUSTMENTS_DEFAULT,
      rotation: 17,
      flipH: false,
    });
    expect(Math.abs(withFlipThenRotate.x - original.x) > 1e-6).toBe(true);
  });
});
