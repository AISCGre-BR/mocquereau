// @vitest-environment jsdom
import "../i18n";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { TablePreview } from "./TablePreview";
import { TabelaTools } from "./table-preview/TabelaTools";
import { TableZoomProvider } from "../hooks/useTableZoom";
import {
  ProjectContext,
  createNewProject,
  useProjectReducer,
  type DocumentAction,
  type ProjectState,
} from "../hooks/useProject";
import type { ManuscriptSource, MocquereauProject } from "../lib/models";

const IMG = { dataUrl: "data:image/png;base64,iVBORw0KGgo=", width: 100, height: 50, mimeType: "image/png" };

// "Puer natus est": Pu | er | na | tus | est — words start at 0, 2 and 4.
const WORDS = [
  { original: "Puer", syllables: ["Pu", "er"] },
  { original: "natus", syllables: ["na", "tus"] },
  { original: "est", syllables: ["est"] },
];

function mkSource(id: string, order: number, type: string | null, extra: Partial<ManuscriptSource["metadata"]> = {}): ManuscriptSource {
  return {
    id,
    order,
    metadata: { siglum: id, library: "", city: "", century: "", classes: [type, null, null], ...extra },
    lines: [
      {
        id: `${id}-l`,
        image: IMG,
        syllableRange: { start: 0, end: 4 },
        dividers: [],
        gaps: [],
        // 0 filled, 1 gap, the rest pending.
        syllableBoxes: { 0: { x: 0, y: 0, w: 0.2, h: 0.5 }, 1: null },
        folio: "12r",
        confirmed: true,
      },
    ],
    syllableCuts: {},
  };
}

function mkProject(sources: ManuscriptSource[], author = "André Gaby"): MocquereauProject {
  return {
    ...createNewProject("Gloria VIII", author),
    text: { raw: "Puer natus est", words: WORDS, hyphenationMode: "manual" },
    sources,
  };
}

function mount(project: MocquereauProject, onNavigateToEditor = vi.fn()) {
  const ref: { state?: ProjectState; dispatch?: React.Dispatch<DocumentAction> } = {};
  function Harness() {
    const [state, dispatch, history] = useProjectReducer();
    Object.assign(ref, { state, dispatch });
    if (!state.project) return null;
    return (
      <ProjectContext.Provider value={{ state, dispatch, history }}>
        <TableZoomProvider>
          <div role="toolbar">
            <TabelaTools />
          </div>
          <TablePreview onNavigateToEditor={onNavigateToEditor} />
        </TableZoomProvider>
      </ProjectContext.Provider>
    );
  }
  const utils = render(<Harness />);
  act(() => ref.dispatch!({ type: "SET_PROJECT", payload: project }));
  return { ...utils, ref, onNavigateToEditor };
}

const header = (i: number) => screen.getByTestId(`syllable-header-${i}`);

beforeEach(() => {
  window.mocquereau = { platform: "linux" } as never;
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("TablePreview: cartão do documento", () => {
  it("não tem o título 'Tabela Comparativa'; mostra título e autor da peça", () => {
    mount(mkProject([mkSource("A", 0, null)]));
    expect(screen.queryByText("Tabela Comparativa")).toBeNull();
    expect(screen.getByRole("heading", { name: "Gloria VIII" })).toBeTruthy();
    expect(screen.getByText("André Gaby")).toBeTruthy();
  });

  it("omite o autor vazio", () => {
    const { container } = mount(mkProject([mkSource("A", 0, null)], ""));
    expect(container.querySelector("[data-testid='piece-author']")).toBeNull();
  });

  it("estado vazio: a frase fica no cartão, sem título 'Tabela Comparativa'", () => {
    mount(mkProject([]));
    expect(screen.getByText("Nenhuma fonte adicionada ao projeto.")).toBeTruthy();
    expect(screen.queryByText("Tabela Comparativa")).toBeNull();
  });

  it("legenda da fonte: cidade, data · fólio, sem partes vazias", () => {
    mount(mkProject([mkSource("A", 0, null, { city: "Laon", century: "X" }), mkSource("B", 1, null)]));
    expect(screen.getByText("Laon, X · f. 12r")).toBeTruthy();
    expect(screen.getByText("f. 12r")).toBeTruthy();
  });
});

describe("TablePreview: grupos", () => {
  it("linhas de grupo na ordem dos valores, antes das fontes; o grupo sem valor não tem linha", () => {
    mount(
      mkProject([
        mkSource("Q", 0, "tipo.quadrada"),
        mkSource("N", 1, null),
        mkSource("A", 2, "tipo.adiastematica"),
      ]),
    );
    const rows = screen.getAllByTestId(/^(group|source)-row-/).map((el) => el.getAttribute("data-testid"));
    expect(rows).toEqual([
      "group-row-tipo.adiastematica",
      "source-row-A",
      "group-row-tipo.quadrada",
      "source-row-Q",
      "source-row-N",
    ]);
    expect(screen.getByTestId("group-row-tipo.adiastematica").textContent).toBe("Adiastemática");
  });

  it("nenhuma linha de grupo quando nenhuma fonte tem nível 1", () => {
    mount(mkProject([mkSource("A", 0, null), mkSource("B", 1, null)]));
    expect(screen.queryAllByTestId(/^group-row-/)).toHaveLength(0);
    expect(screen.getAllByTestId(/^source-row-/)).toHaveLength(2);
  });
});

describe("TablePreview: cabeçalho de sílabas", () => {
  it("uma linha só, sem os pontos de acento", () => {
    mount(mkProject([mkSource("A", 0, null)]));
    expect(screen.queryByTitle("Acento principal")).toBeNull();
    expect(document.body.textContent).not.toContain("●");
    expect(header(0).textContent).toBe("Pu");
    expect(header(0).className).toContain("font-serif");
  });

  it("borda esquerda rule-strong na fronteira de palavra, rule-soft dentro dela", () => {
    mount(mkProject([mkSource("A", 0, null)]));
    const strong = (el: Element) => el.className.split(/\s+/).includes("border-l-rule-strong");
    expect([0, 1, 2, 3, 4].map((i) => strong(header(i)))).toEqual([false, false, true, false, true]);
    expect(header(1).className).toContain("border-rule-soft");
    const cells = Array.from(screen.getByTestId("source-row-A").querySelectorAll("[data-testid^='cell-']"));
    expect(cells.map(strong)).toEqual([false, false, true, false, true]);
  });
});

describe("TablePreview: células", () => {
  it("clique na célula pendente leva a Recortes na fonte e sílaba", () => {
    const { onNavigateToEditor } = mount(mkProject([mkSource("A", 0, null)]));
    fireEvent.click(screen.getByTestId("cell-A-3"));
    expect(onNavigateToEditor).toHaveBeenCalledWith("A", 3);
  });

  it("pendente sem borda tracejada; sem neuma mostra o travessão", () => {
    mount(mkProject([mkSource("A", 0, null)]));
    const pending = screen.getByTestId("cell-A-3");
    expect(pending.className).toContain("bg-parchment");
    expect(pending.querySelector(".border-dashed")).toBeNull();
    expect(screen.getByTestId("cell-A-1").textContent).toBe("—");
  });

  it("clique na célula preenchida abre o menu de contexto", () => {
    const { onNavigateToEditor } = mount(mkProject([mkSource("A", 0, null)]));
    fireEvent.click(screen.getByTestId("cell-A-0"));
    expect(onNavigateToEditor).not.toHaveBeenCalled();
    expect(screen.getByRole("menu")).toBeTruthy();
  });
});

describe("TablePreview: zoom", () => {
  it("os botões da barra mudam a largura das colunas", () => {
    mount(mkProject([mkSource("A", 0, null)]));
    const base = parseInt(header(0).style.width, 10);
    fireEvent.click(screen.getByRole("button", { name: "Aumentar zoom" }));
    expect(parseInt(header(0).style.width, 10)).toBeGreaterThan(base);
    fireEvent.click(screen.getByRole("button", { name: /Zoom atual 125%/ }));
    expect(parseInt(header(0).style.width, 10)).toBe(base);
    fireEvent.click(screen.getByRole("button", { name: "Diminuir zoom" }));
    expect(parseInt(header(0).style.width, 10)).toBeLessThan(base);
  });

  it("Ctrl+= e Ctrl+0 agem com a tabela montada", () => {
    mount(mkProject([mkSource("A", 0, null)]));
    const base = parseInt(header(0).style.width, 10);
    fireEvent.keyDown(window, { key: "=", ctrlKey: true });
    expect(parseInt(header(0).style.width, 10)).toBeGreaterThan(base);
    fireEvent.keyDown(window, { key: "0", code: "Digit0", ctrlKey: true });
    expect(parseInt(header(0).style.width, 10)).toBe(base);
  });
});
