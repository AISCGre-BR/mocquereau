import { describe, expect, it } from "vitest";
import { loadCases } from "./cases";
import { oneAnchorScenario } from "./metrics";
import { planCase } from "./node";

// PNG 1x1 válido (o migrador confere a assinatura dos bytes).
const PNG = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

function legacy(boxes: Record<number, unknown>) {
  return {
    title: "T",
    text: { raw: "Pu er na tus", words: [{ original: "Puer", syllables: ["Pu", "er"] }, { original: "natus", syllables: ["na", "tus"] }], hyphenationMode: "manual" },
    sources: [{
      id: "s1", order: 1, metadata: { siglum: "X1", library: "", city: "", century: "", notation: "adiastematic" },
      lines: [{ id: "l1", image: { dataUrl: PNG, width: 1, height: 1, mimeType: "image/png" }, syllableRange: { start: 0, end: 3 }, dividers: [], gaps: [], syllableBoxes: boxes, confirmed: true }],
      syllableCuts: {},
    }],
  };
}

describe("cenário uma âncora pelo plano do app", () => {
  it("a sílaba ancorada vira caixa da página: âncora no plano e fora dos alvos (suggest: false)", async () => {
    const { cases } = await loadCases(legacy({ 0: { x: 0.1, y: 0.1, w: 0.1, h: 0.2 }, 2: { x: 0.4, y: 0.1, w: 0.1, h: 0.2 } }), "teste");
    const c = cases[0];
    const cold = planCase(c)!;
    expect(cold.input.anchors ?? []).toEqual([]);
    expect(cold.input.syllables.find((s) => s.index === 0)?.suggest).not.toBe(false);

    const { anchors } = oneAnchorScenario(c.gt, c.areas);
    expect(anchors.map((g) => g.index)).toEqual([0]);
    const plan = planCase(c, anchors)!;
    expect(plan.input.anchors?.map((a) => a.index)).toEqual([0]);
    expect(plan.input.syllables.find((s) => s.index === 0)?.suggest).toBe(false);
    expect(plan.input.syllables.filter((s) => s.suggest !== false).map((s) => s.index)).toEqual([1, 2, 3]);
    // a caixa chega em frações da região, vinda da caixa gravada (moldura da linha)
    const a = plan.input.anchors![0].box;
    const g = c.gt[0].box;
    const back = { x: plan.region.x + a.x * plan.region.w, y: plan.region.y + a.y * plan.region.h };
    expect(back.x).toBeCloseTo(g.x, 9);
    expect(back.y).toBeCloseTo(g.y, 9);
  });
});
