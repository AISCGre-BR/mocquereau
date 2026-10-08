import { describe, expect, it } from "vitest";
import type { ManuscriptLine, ManuscriptSource, StoredImage } from "./models";
import { isLineGap, planGapToggle, toggleCellGap } from "./syllable-gap";
import { resolveCellState } from "./tableUtils";

const IMG: StoredImage = { dataUrl: "data:,", width: 10, height: 10, mimeType: "image/png" };
const BOX = { x: 0.1, y: 0.1, w: 0.1, h: 0.1 };

function line(id: string, extra: Partial<ManuscriptLine> = {}): ManuscriptLine {
  return { id, image: IMG, syllableRange: { start: 0, end: 3 }, dividers: [], gaps: [], syllableBoxes: {}, confirmed: false, ...extra };
}

function source(lines: ManuscriptLine[], syllableCuts: ManuscriptSource["syllableCuts"] = {}): ManuscriptSource {
  return {
    id: "A",
    order: 0,
    metadata: { siglum: "A", library: "", city: "", century: "", classes: [null, null, null] },
    lines,
    syllableCuts,
  };
}

describe("planGapToggle", () => {
  it("marcar numa sílaba com caixa: entra em gaps e a caixa sai", () => {
    const l = line("a", { syllableBoxes: { 1: BOX } });
    expect(planGapToggle(source([l]), l, 1)).toEqual({ adding: true, gaps: [1], dropBox: true, dropCut: false });
  });

  it("desmarcar um gap legado (caixa null e recorte null): os dois saem", () => {
    const l = line("a", { syllableBoxes: { 1: null } });
    expect(isLineGap(l, 1)).toBe(true);
    expect(planGapToggle(source([l], { 1: null }), l, 1)).toEqual({ adding: false, gaps: [], dropBox: true, dropCut: true });
  });
});

describe("toggleCellGap (Tabela)", () => {
  it("marcar uma célula preenchida: a página que decide ganha o gap e perde só a sua caixa", () => {
    const a = line("a", { syllableBoxes: { 0: BOX }, confirmed: true });
    const b = line("b", { syllableBoxes: { 0: BOX, 1: BOX }, confirmed: true });
    const next = toggleCellGap(source([a, b]), 0);
    expect(next.lines[0]).toMatchObject({ gaps: [0], syllableBoxes: {}, confirmed: false });
    expect(next.lines[1]).toBe(b);
    expect(resolveCellState(next, 0).kind).toBe("gap");
  });

  it("marcar quando nenhuma página decide: vai para a primeira página que cobre a sílaba", () => {
    const a = line("a", { syllableRange: { start: 2, end: 3 } });
    const b = line("b");
    const next = toggleCellGap(source([a, b]), 0);
    expect(next.lines[0]).toBe(a);
    expect(next.lines[1].gaps).toEqual([0]);
    expect(resolveCellState(next, 0).kind).toBe("gap");
  });

  it("desmarcar um gap feito em Recortes: sai de gaps e a célula fica pendente", () => {
    const a = line("a", { gaps: [2] });
    const next = toggleCellGap(source([a]), 2);
    expect(next.lines[0].gaps).toEqual([]);
    expect(resolveCellState(next, 2).kind).toBe("unfilled");
  });

  it("desmarcar um gap legado: limpa a caixa null da página e o recorte null", () => {
    const a = line("a", { syllableBoxes: { 1: null, 0: BOX } });
    const next = toggleCellGap(source([a], { 1: null }), 1);
    expect(1 in next.lines[0].syllableBoxes!).toBe(false);
    expect(next.lines[0].syllableBoxes![0]).toEqual(BOX);
    expect(1 in next.syllableCuts).toBe(false);
    expect(resolveCellState(next, 1).kind).toBe("unfilled");
  });

  it("sem página que cubra a sílaba: alterna o recorte null legado", () => {
    const a = line("a", { syllableRange: { start: 2, end: 3 } });
    const marked = toggleCellGap(source([a], { 0: IMG }), 0);
    expect(marked.syllableCuts[0]).toBeNull();
    const unmarked = toggleCellGap(marked, 0);
    expect(0 in unmarked.syllableCuts).toBe(false);
  });
});
