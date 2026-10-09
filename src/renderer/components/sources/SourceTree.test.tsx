// @vitest-environment jsdom
import "../../i18n";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { SourceTree, resetSourceTreeSession } from "./SourceTree";
import {
  ProjectContext,
  createNewProject,
  useProjectReducer,
  type DocumentAction,
  type HistoryApi,
  type ProjectState,
} from "../../hooks/useProject";
import { RecortesProvider, useRecortesContext, type RecortesContextValue } from "../../hooks/RecortesContext";
import { syllabifyText } from "../../lib/syllabify";
import type { ManuscriptLine, ManuscriptSource, MocquereauProject } from "../../lib/models";

vi.mock("../../lib/image-utils", () => ({
  fileToDataUrl: vi.fn(),
  resizeImageIfNeeded: vi.fn(),
}));
import { fileToDataUrl, resizeImageIfNeeded } from "../../lib/image-utils";

const IMG = { dataUrl: "data:image/png;base64,iVBORw0KGgo=", width: 100, height: 50, mimeType: "image/png" };
const classification = createNewProject("T", "").classification;
const [QUADRADA, ADIASTEMATICA] = [classification[0].values[2], classification[0].values[0]];

function mkLine(id: string, over: Partial<ManuscriptLine> = {}): ManuscriptLine {
  return {
    id,
    image: IMG,
    syllableRange: { start: 0, end: 1 },
    dividers: [],
    gaps: [],
    syllableBoxes: {},
    confirmed: false,
    ...over,
  };
}

function mkSource(id: string, order: number, cls: string | null, lines: ManuscriptLine[] = []): ManuscriptSource {
  return {
    id,
    order,
    metadata: { siglum: id, library: "", city: "", century: "", classes: [cls, null, null] },
    lines,
    syllableCuts: {},
  };
}

// "Puer natus est" → 5 syllables.
function projectWith(sources: ManuscriptSource[]): MocquereauProject {
  const raw = "Puer natus est";
  return { ...createNewProject("T", ""), text: { raw, words: syllabifyText(raw, "sung"), hyphenationMode: "sung" }, sources };
}

function mount(project: MocquereauProject, onEditSource = vi.fn()) {
  const ref: {
    state?: ProjectState;
    dispatch?: React.Dispatch<DocumentAction>;
    history?: HistoryApi;
    recortes?: RecortesContextValue;
  } = {};
  function Probe() {
    ref.recortes = useRecortesContext();
    return null;
  }
  function Harness() {
    const [state, dispatch, history] = useProjectReducer();
    Object.assign(ref, { state, dispatch, history });
    if (!state.project) return null;
    return (
      <ProjectContext.Provider value={{ state, dispatch, history }}>
        <RecortesProvider>
          <Probe />
          <SourceTree onEditSource={onEditSource} />
        </RecortesProvider>
      </ProjectContext.Provider>
    );
  }
  const utils = render(<Harness />);
  act(() => ref.dispatch!({ type: "SET_PROJECT", payload: project }));
  const sources = () => ref.state!.project!.sources;
  return { ...utils, ref, sources, onEditSource };
}

const flush = () => act(async () => {});

beforeEach(() => {
  window.mocquereau = {
    readClipboardImage: vi.fn(),
    openImageFile: vi.fn(),
    importGueranger: vi.fn(),
  } as never;
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  resetSourceTreeSession();
});

const sourceItem = (siglum: string) =>
  screen.getAllByRole("treeitem").find((el) => el.getAttribute("data-source-id") === siglum)!;

describe("SourceTree: grupos", () => {
  it("agrupa pelo nível 1 na ordem da classificação; as sem valor ficam no fim, sem cabeçalho", () => {
    mount(
      projectWith([
        mkSource("Sem", 1, null),
        mkSource("Q1", 2, QUADRADA.id),
        mkSource("A1", 3, ADIASTEMATICA.id),
      ]),
    );
    const tree = screen.getByRole("tree");
    const text = tree.textContent ?? "";
    expect(text.indexOf(ADIASTEMATICA.name)).toBeLessThan(text.indexOf("A1"));
    expect(text.indexOf("A1")).toBeLessThan(text.indexOf(QUADRADA.name));
    expect(text.indexOf(QUADRADA.name)).toBeLessThan(text.indexOf("Q1"));
    expect(text.indexOf("Q1")).toBeLessThan(text.indexOf("Sem"));
    // Two headers only: the group without a value has none.
    expect(tree.querySelectorAll("[data-group-header]")).toHaveLength(2);
  });

  it("legenda Cidade, Data omite as partes vazias", () => {
    const a = mkSource("A", 1, null);
    a.metadata.city = "Arouca";
    a.metadata.century = "1485";
    const b = mkSource("B", 2, null);
    b.metadata.century = "XII";
    mount(projectWith([a, b]));
    expect(within(sourceItem("A")).getByText("Arouca, 1485")).toBeTruthy();
    expect(within(sourceItem("B")).getByText("XII")).toBeTruthy();
  });
});

describe("SourceTree: páginas", () => {
  it("páginas aparecem só sob fontes expandidas; a ativa começa expandida", () => {
    mount(
      projectWith([
        mkSource("A", 1, null, [mkLine("a1", { folio: "12r" })]),
        mkSource("B", 2, null, [mkLine("b1", { folio: "7v" })]),
      ]),
    );
    expect(screen.queryByText("12r")).not.toBeNull();
    expect(screen.queryByText("7v")).toBeNull();
    expect(sourceItem("A").getAttribute("aria-expanded")).toBe("true");
    expect(sourceItem("B").getAttribute("aria-expanded")).toBe("false");

    fireEvent.click(within(sourceItem("B")).getByTestId("source-chevron"));
    expect(screen.queryByText("7v")).not.toBeNull();
    fireEvent.click(within(sourceItem("A")).getByTestId("source-chevron"));
    expect(screen.queryByText("12r")).toBeNull();
  });

  it("página sem fólio mostra —; a confirmada tem o check", () => {
    mount(projectWith([mkSource("A", 1, null, [mkLine("a1", { confirmed: true, syllableBoxes: { 0: { x: 0, y: 0, w: 0.1, h: 0.1 } } })])]));
    const page = screen.getAllByRole("treeitem").find((el) => el.getAttribute("data-line-id") === "a1")!;
    expect(within(page).getByText("—")).toBeTruthy();
    expect(page.querySelector("[data-confirmed]")).not.toBeNull();
  });

  it("clicar numa página a seleciona", () => {
    const { ref } = mount(projectWith([mkSource("A", 1, null, [mkLine("a1", { folio: "1r" }), mkLine("a2", { folio: "1v" })])]));
    fireEvent.click(screen.getByText("1v"));
    expect(ref.recortes!.activeLineId).toBe("a2");
    const page = screen.getAllByRole("treeitem").find((el) => el.getAttribute("data-line-id") === "a2")!;
    expect(page.getAttribute("aria-selected")).toBe("true");
  });

  it('"+ Página" só aparece sob a fonte ativa e abre o arquivo pela ponte', async () => {
    const { ref, sources } = mount(projectWith([mkSource("A", 1, null), mkSource("B", 2, null)]));
    expect(screen.getAllByRole("button", { name: "Página" })).toHaveLength(1);
    vi.mocked(window.mocquereau.openImageFile).mockResolvedValue({ dataUrl: IMG.dataUrl, width: 100, height: 50 });
    fireEvent.click(screen.getByRole("button", { name: "Página" }));
    await flush();
    expect(sources()[0].lines).toHaveLength(1);
    // Range continues from the end of the last confirmed page (none here: whole text).
    expect(sources()[0].lines[0].syllableRange).toEqual({ start: 0, end: 4 });
    expect(ref.recortes!.activeLineId).toBe(sources()[0].lines[0].id);
  });

  it("soltar um arquivo sobre uma fonte inativa adiciona a página a ela e a seleciona", async () => {
    vi.mocked(fileToDataUrl).mockResolvedValue(IMG);
    const { ref, sources } = mount(projectWith([mkSource("A", 1, null), mkSource("B", 2, null)]));
    const file = new File(["x"], "p.png", { type: "image/png" });
    fireEvent.drop(sourceItem("B"), { dataTransfer: { files: [file], types: ["Files"] } });
    await flush();
    expect(sources()[1].lines).toHaveLength(1);
    expect(sources()[0].lines).toHaveLength(0);
    expect(ref.recortes!.activeSourceId).toBe("B");
    expect(ref.recortes!.activeLineId).toBe(sources()[1].lines[0].id);
  });

  it("imagem acima de 2000 px abre o diálogo de redimensionar", async () => {
    const big = { ...IMG, width: 3000, height: 2000 };
    const small = { ...IMG, width: 2000, height: 1333 };
    vi.mocked(window.mocquereau.openImageFile).mockResolvedValue({ dataUrl: big.dataUrl, width: 3000, height: 2000 });
    vi.mocked(resizeImageIfNeeded).mockResolvedValue(small);
    const { sources } = mount(projectWith([mkSource("A", 1, null)]));
    fireEvent.click(screen.getByRole("button", { name: "Página" }));
    await flush();
    const dialog = screen.getByRole("dialog");
    expect(sources()[0].lines).toHaveLength(0);
    fireEvent.click(within(dialog).getByRole("button", { name: "Redimensionar" }));
    await flush();
    expect(resizeImageIfNeeded).toHaveBeenCalled();
    expect(sources()[0].lines[0].image.width).toBe(2000);
  });
});

describe("SourceTree: menus", () => {
  function openMenu(el: HTMLElement) {
    fireEvent.contextMenu(el, { clientX: 10, clientY: 10 });
    return screen.getByRole("menu");
  }

  it('"Excluir fonte…" pede confirmação antes de excluir', () => {
    const { sources } = mount(projectWith([mkSource("A", 1, null), mkSource("B", 2, null)]));
    const menu = openMenu(sourceItem("B"));
    fireEvent.click(within(menu).getByRole("menuitem", { name: "Excluir fonte…" }));
    expect(sources()).toHaveLength(2);
    const dialog = screen.getByRole("dialog");
    fireEvent.click(within(dialog).getByRole("button", { name: "Excluir" }));
    expect(sources().map((s) => s.id)).toEqual(["A"]);
  });

  it('"Mover para baixo" fica desabilitado na última e "Mover para cima" na primeira', () => {
    mount(projectWith([mkSource("A", 1, null), mkSource("B", 2, null)]));
    let menu = openMenu(sourceItem("B"));
    expect((within(menu).getByRole("menuitem", { name: "Mover para baixo" }) as HTMLButtonElement).disabled).toBe(true);
    expect((within(menu).getByRole("menuitem", { name: "Mover para cima" }) as HTMLButtonElement).disabled).toBe(false);
    fireEvent.keyDown(menu, { key: "Escape" });
    menu = openMenu(sourceItem("A"));
    expect((within(menu).getByRole("menuitem", { name: "Mover para cima" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("mover dentro do grupo passa pelas fontes de outros grupos num passo só de desfazer", () => {
    const { sources, ref } = mount(
      projectWith([mkSource("Q1", 1, QUADRADA.id), mkSource("X", 2, null), mkSource("Q2", 3, QUADRADA.id)]),
    );
    const menu = openMenu(sourceItem("Q2"));
    fireEvent.click(within(menu).getByRole("menuitem", { name: "Mover para cima" }));
    expect(sources().map((s) => s.id)).toEqual(["Q2", "Q1", "X"]);
    act(() => ref.dispatch!({ type: "UNDO" }));
    expect(sources().map((s) => s.id)).toEqual(["Q1", "X", "Q2"]);
  });

  it('"Editar…" e o duplo clique chamam onEditSource', () => {
    const { onEditSource } = mount(projectWith([mkSource("A", 1, null)]));
    fireEvent.doubleClick(within(sourceItem("A")).getByText("A"));
    expect(onEditSource).toHaveBeenCalledWith("A");
    const menu = openMenu(sourceItem("A"));
    fireEvent.click(within(menu).getByRole("menuitem", { name: "Editar…" }));
    expect(onEditSource).toHaveBeenCalledTimes(2);
  });

  it('"Remover página…" remove a página e os recortes do intervalo dela, após confirmar', () => {
    const src = mkSource("A", 1, null, [mkLine("a1", { syllableRange: { start: 0, end: 1 } }), mkLine("a2", { syllableRange: { start: 2, end: 4 } })]);
    src.syllableCuts = { 0: { dataUrl: "x" }, 3: { dataUrl: "y" } } as never;
    const { sources } = mount(projectWith([src]));
    const page = screen.getAllByRole("treeitem").find((el) => el.getAttribute("data-line-id") === "a1")!;
    const menu = openMenu(page);
    fireEvent.click(within(menu).getByRole("menuitem", { name: "Remover página…" }));
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Remover" }));
    expect(sources()[0].lines.map((l) => l.id)).toEqual(["a2"]);
    expect(Object.keys(sources()[0].syllableCuts)).toEqual(["3"]);
  });

  it('"Fólio…" grava fólio e rótulo, vazios viram indefinidos', () => {
    const { sources } = mount(projectWith([mkSource("A", 1, null, [mkLine("a1", { label: "início" })])]));
    const page = screen.getAllByRole("treeitem").find((el) => el.getAttribute("data-line-id") === "a1")!;
    fireEvent.click(within(openMenu(page)).getByRole("menuitem", { name: "Fólio…" }));
    const dialog = screen.getByRole("dialog");
    fireEvent.change(within(dialog).getByLabelText("Fólio"), { target: { value: " 12r " } });
    fireEvent.change(within(dialog).getByLabelText("Rótulo"), { target: { value: "  " } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Salvar" }));
    expect(sources()[0].lines[0].folio).toBe("12r");
    expect(sources()[0].lines[0].label).toBeUndefined();
  });

  it('"Notação" marca a atual e grava SET_LINE_NOTATION (S9)', () => {
    const { sources, ref } = mount(projectWith([mkSource("A", 1, null, [mkLine("a1")])]));
    const page = () => screen.getAllByRole("treeitem").find((el) => el.getAttribute("data-line-id") === "a1")!;
    const openNotation = () => {
      const menu = openMenu(page());
      fireEvent.click(within(menu).getByRole("menuitem", { name: "Notação" }));
      return screen.getAllByRole("menu").find((m) => m.getAttribute("aria-label") === "Notação")!;
    };
    const checked = (sub: HTMLElement) =>
      within(sub)
        .getAllByRole("menuitemcheckbox")
        .filter((el) => el.getAttribute("aria-checked") === "true")
        .map((el) => el.textContent);
    let sub = openNotation();
    expect(within(sub).getAllByRole("menuitemcheckbox").map((el) => el.textContent)).toEqual([
      "Automática",
      "Adiastemática",
      "Diastemática",
    ]);
    expect(checked(sub)).toEqual(["Automática"]);
    fireEvent.click(within(sub).getByRole("menuitemcheckbox", { name: "Diastemática" }));
    expect(sources()[0].lines[0].notationOverride).toBe("diastematic");
    expect(screen.queryByRole("menu")).toBeNull();

    sub = openNotation();
    expect(checked(sub)).toEqual(["Diastemática"]);
    fireEvent.click(within(sub).getByRole("menuitemcheckbox", { name: "Automática" }));
    expect(sources()[0].lines[0].notationOverride).toBeUndefined();
    act(() => ref.dispatch!({ type: "UNDO" }));
    expect(sources()[0].lines[0].notationOverride).toBe("diastematic");
  });

  it('"Nova fonte" cria uma fonte vazia, seleciona e abre o diálogo', () => {
    const { sources, ref, onEditSource } = mount(projectWith([mkSource("A", 1, null)]));
    fireEvent.click(screen.getByRole("button", { name: "Nova fonte" }));
    expect(sources()).toHaveLength(2);
    const id = sources()[1].id;
    expect(ref.recortes!.activeSourceId).toBe(id);
    expect(onEditSource).toHaveBeenCalledWith(id);
  });

  it('"Importar do Gueranger…" adiciona as fontes importadas', async () => {
    vi.mocked(window.mocquereau.importGueranger).mockResolvedValue({
      manuscripts: [{ siglum: "G1", library: "", city: "", century: "", folio: "3r" }],
    } as never);
    const { sources } = mount(projectWith([mkSource("A", 1, null)]));
    fireEvent.click(screen.getByRole("button", { name: "Mais opções de fonte" }));
    fireEvent.click(within(screen.getByRole("menu")).getByRole("menuitem", { name: "Importar do Gueranger…" }));
    await flush();
    expect(sources().map((s) => s.metadata.siglum)).toEqual(["A", "G1"]);
    expect(sources()[1].metadata.folioHint).toBe("3r");
  });

  it("várias fontes importadas de uma vez são um passo de desfazer", async () => {
    vi.mocked(window.mocquereau.importGueranger).mockResolvedValue({
      manuscripts: [
        { siglum: "G1", library: "", city: "", century: "" },
        { siglum: "G2", library: "", city: "", century: "" },
      ],
    } as never);
    const { sources, ref } = mount(projectWith([mkSource("A", 1, null)]));
    fireEvent.click(screen.getByRole("button", { name: "Mais opções de fonte" }));
    fireEvent.click(within(screen.getByRole("menu")).getByRole("menuitem", { name: "Importar do Gueranger…" }));
    await flush();
    expect(sources().map((s) => s.metadata.siglum)).toEqual(["A", "G1", "G2"]);
    act(() => ref.history!.undo());
    expect(sources().map((s) => s.metadata.siglum)).toEqual(["A"]);
    expect(ref.history!.canUndo).toBe(false);
  });
});

describe("SourceTree: acessibilidade", () => {
  it("página sem fólio tem nome acessível 'Página n'; com fólio, o fólio", () => {
    mount(projectWith([mkSource("A", 1, null, [mkLine("a1", { folio: "12r" }), mkLine("a2")])]));
    act(() => fireEvent.keyDown(sourceItem("A"), { key: "ArrowRight" }));
    expect(screen.getByRole("treeitem", { name: "12r" }).getAttribute("data-line-id")).toBe("a1");
    expect(screen.getByRole("treeitem", { name: "Página 2" }).getAttribute("data-line-id")).toBe("a2");
  });

  it("o grupo de páginas pertence ao item da fonte (aria-owns)", () => {
    mount(projectWith([mkSource("A", 1, null, [mkLine("a1")])]));
    act(() => fireEvent.keyDown(sourceItem("A"), { key: "ArrowRight" }));
    const group = screen.getByRole("group");
    expect(group.id).not.toBe("");
    expect(sourceItem("A").getAttribute("aria-owns")).toBe(group.id);
  });
});

describe("SourceTree: teclado", () => {
  it("setas percorrem fontes e páginas; direita/esquerda expandem e recolhem; Enter seleciona", () => {
    const { ref } = mount(
      projectWith([mkSource("A", 1, null, [mkLine("a1", { folio: "1r" })]), mkSource("B", 2, null, [mkLine("b1", { folio: "2r" })])]),
    );
    const tree = screen.getByRole("tree");
    const a = sourceItem("A");
    act(() => a.focus());
    fireEvent.keyDown(a, { key: "ArrowDown" });
    const a1 = screen.getAllByRole("treeitem").find((el) => el.getAttribute("data-line-id") === "a1")!;
    expect(document.activeElement).toBe(a1);
    fireEvent.keyDown(a1, { key: "ArrowDown" });
    expect(document.activeElement).toBe(sourceItem("B"));
    fireEvent.keyDown(sourceItem("B"), { key: "ArrowRight" });
    expect(sourceItem("B").getAttribute("aria-expanded")).toBe("true");
    fireEvent.keyDown(sourceItem("B"), { key: "ArrowLeft" });
    expect(sourceItem("B").getAttribute("aria-expanded")).toBe("false");
    fireEvent.keyDown(sourceItem("B"), { key: "Enter" });
    expect(ref.recortes!.activeSourceId).toBe("B");
    expect(tree).toBeTruthy();
  });

  it("Shift+F10 abre o menu da fonte focada", () => {
    mount(projectWith([mkSource("A", 1, null)]));
    const a = sourceItem("A");
    act(() => a.focus());
    fireEvent.keyDown(a, { key: "F10", shiftKey: true });
    expect(screen.getByRole("menu")).toBeTruthy();
  });
});
