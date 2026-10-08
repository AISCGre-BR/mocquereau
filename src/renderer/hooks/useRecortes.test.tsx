// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { act, cleanup, renderHook } from "@testing-library/react";
import { effectiveRange, useRecortes } from "./useRecortes";
import { createNewProject } from "./useProject";
import { syllabifyText } from "../lib/syllabify";
import type { ManuscriptLine, ManuscriptSource, MocquereauProject } from "../lib/models";

afterEach(cleanup);

const IMG = { dataUrl: "data:,", width: 10, height: 10, mimeType: "image/png" };
const BOX = { x: 0.1, y: 0.1, w: 0.1, h: 0.1 };

function line(id: string, start: number, end: number, confirmed = false): ManuscriptLine {
  return {
    id,
    image: IMG,
    syllableRange: { start, end },
    dividers: [],
    gaps: [],
    syllableBoxes: confirmed ? { [start]: BOX } : {},
    confirmed,
  };
}

function source(id: string, lines: ManuscriptLine[]): ManuscriptSource {
  return {
    id,
    order: 1,
    metadata: { siglum: id, library: "", city: "", century: "", classes: [null, null, null] },
    lines,
    syllableCuts: {},
  };
}

// "Puer natus est nobis" → Pu-er na-tus est no-bis: 7 syllables.
function project(sources: ManuscriptSource[]): MocquereauProject {
  const raw = "Puer natus est nobis";
  return { ...createNewProject("T", ""), text: { raw, words: syllabifyText(raw, "sung"), hyphenationMode: "sung" }, sources };
}

function setup(initial: MocquereauProject | null) {
  return renderHook(({ p }) => useRecortes(p), { initialProps: { p: initial } });
}

describe("useRecortes: seleção inicial", () => {
  it("primeira fonte e primeira página não confirmada; sílaba ativa no início do intervalo", () => {
    const p = project([source("A", [line("a1", 0, 2, true), line("a2", 3, 6)]), source("B", [])]);
    const { result } = setup(p);
    expect(result.current.activeSourceId).toBe("A");
    expect(result.current.activeLineId).toBe("a2");
    expect(result.current.activeSyllable).toBe(3);
    expect(result.current.zoom).toBe(1);
    expect(result.current.drawMode).toBe(true);
    expect(result.current.showAll).toBe(true);
    expect(result.current.sameSize).toBe(false);
    expect(result.current.imagePanelOpen).toBe(false);
  });

  it("todas confirmadas: a primeira página", () => {
    const { result } = setup(project([source("A", [line("a1", 0, 2, true), line("a2", 3, 6, true)])]));
    expect(result.current.activeLineId).toBe("a1");
  });

  it("sem projeto ou sem fontes: nada selecionado", () => {
    expect(setup(null).result.current.activeSourceId).toBeNull();
    const { result } = setup(project([]));
    expect(result.current.activeSourceId).toBeNull();
    expect(result.current.activeLineId).toBeNull();
    expect(result.current.activeSyllable).toBeNull();
  });

  it("intervalo {0,0} legado vale como o texto inteiro", () => {
    expect(effectiveRange(line("x", 0, 0), 7)).toEqual({ start: 0, end: 6 });
    expect(effectiveRange(line("x", 2, 4), 7)).toEqual({ start: 2, end: 4 });
  });
});

describe("useRecortes: seleção", () => {
  it("selectSource escolhe a primeira página não confirmada, zera o zoom e fecha o painel", () => {
    const p = project([source("A", [line("a1", 0, 2)]), source("B", [line("b1", 0, 1, true), line("b2", 2, 5)])]);
    const { result } = setup(p);
    act(() => {
      result.current.setZoom(2);
      result.current.setImagePanelOpen(true);
    });
    act(() => result.current.selectSource("B"));
    expect(result.current.activeSourceId).toBe("B");
    expect(result.current.activeLineId).toBe("b2");
    expect(result.current.activeSyllable).toBe(2);
    expect(result.current.zoom).toBe(1);
    expect(result.current.imagePanelOpen).toBe(false);
  });

  it("selectLine de uma página adicionada no mesmo tique ativa o início do intervalo dela", () => {
    const p = project([source("A", [line("a1", 0, 2)])]);
    const { result, rerender } = setup(p);
    act(() => result.current.selectLine("A", "a2"));
    const withNew = project([source("A", [line("a1", 0, 2), line("a2", 3, 6)])]);
    rerender({ p: withNew });
    expect(result.current.activeLineId).toBe("a2");
    expect(result.current.activeSyllable).toBe(3);
  });

  it("setActiveSyllable fixa a sílaba", () => {
    const { result } = setup(project([source("A", [line("a1", 0, 6)])]));
    act(() => result.current.setActiveSyllable(4));
    expect(result.current.activeSyllable).toBe(4);
  });

  it("página ativa removida (desfazer): cai para a primeira válida", () => {
    const p = project([source("A", [line("a1", 0, 2, true), line("a2", 3, 6, true)])]);
    const { result, rerender } = setup(p);
    act(() => result.current.selectLine("A", "a2"));
    expect(result.current.activeLineId).toBe("a2");
    rerender({ p: project([source("A", [line("a1", 0, 2, true)])]) });
    expect(result.current.activeLineId).toBe("a1");
    expect(result.current.activeSyllable).toBe(0);
  });

  it("fonte ativa removida: cai para a primeira fonte", () => {
    const p = project([source("A", [line("a1", 0, 2)]), source("B", [line("b1", 3, 6)])]);
    const { result, rerender } = setup(p);
    act(() => result.current.selectSource("B"));
    rerender({ p: project([source("A", [line("a1", 0, 2)])]) });
    expect(result.current.activeSourceId).toBe("A");
    expect(result.current.activeLineId).toBe("a1");
  });
});

describe("useRecortes: goTo", () => {
  const p = project([source("A", []), source("B", [line("b1", 0, 2, true), line("b2", 3, 6, true)])]);

  it("vai à página cujo intervalo contém a sílaba e a ativa", () => {
    const { result } = setup(p);
    act(() => result.current.goTo({ sourceId: "B", syllable: 4 }));
    expect(result.current.activeSourceId).toBe("B");
    expect(result.current.activeLineId).toBe("b2");
    expect(result.current.activeSyllable).toBe(4);
  });

  it("sem página que contenha a sílaba: a primeira página", () => {
    const outside = project([source("B", [line("b1", 0, 1, true), line("b2", 2, 3, true)])]);
    const { result } = setup(outside);
    act(() => result.current.goTo({ sourceId: "B", syllable: 6 }));
    expect(result.current.activeLineId).toBe("b1");
    expect(result.current.activeSyllable).toBe(6);
  });

  it("sem sílaba: a primeira página e o início do intervalo", () => {
    const { result } = setup(p);
    act(() => result.current.goTo({ sourceId: "B" }));
    expect(result.current.activeLineId).toBe("b1");
    expect(result.current.activeSyllable).toBe(0);
  });

  it("fonte inexistente: não muda a seleção", () => {
    const { result } = setup(p);
    act(() => result.current.goTo({ sourceId: "nope", syllable: 1 }));
    expect(result.current.activeSourceId).toBe("A");
  });
});

describe("useRecortes: alternâncias", () => {
  it("desenhar, mesmo tamanho e mostrar todas", () => {
    const { result } = setup(project([]));
    act(() => {
      result.current.setDrawMode(false);
      result.current.setSameSize(true);
      result.current.setShowAll(false);
    });
    expect([result.current.drawMode, result.current.sameSize, result.current.showAll]).toEqual([false, true, false]);
  });
});
