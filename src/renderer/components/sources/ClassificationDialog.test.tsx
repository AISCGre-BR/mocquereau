// @vitest-environment jsdom
import "../../i18n";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { ClassificationDialog } from "./ClassificationDialog";
import {
  ProjectContext,
  createNewProject,
  useProjectReducer,
  type DocumentAction,
  type HistoryApi,
  type ProjectState,
} from "../../hooks/useProject";
import { SUGGESTED_CLASSIFICATION, cloneClassification } from "@shared/classification";
import type { ManuscriptSource, MocquereauProject } from "../../lib/models";

function mkSource(id: string, classes: [string | null, string | null, string | null]): ManuscriptSource {
  return {
    id,
    order: 1,
    metadata: { siglum: id, library: "", city: "", century: "", classes },
    lines: [],
    syllableCuts: {},
  };
}

function mount(project: MocquereauProject, onClose = vi.fn()) {
  const ref: { state?: ProjectState; dispatch?: React.Dispatch<DocumentAction>; history?: HistoryApi } = {};
  function Harness() {
    const [state, dispatch, history] = useProjectReducer();
    Object.assign(ref, { state, dispatch, history });
    if (!state.project) return null;
    return (
      <ProjectContext.Provider value={{ state, dispatch, history }}>
        <ClassificationDialog onClose={onClose} />
      </ProjectContext.Provider>
    );
  }
  render(<Harness />);
  act(() => ref.dispatch!({ type: "SET_PROJECT", payload: project }));
  const classification = () => ref.state!.project!.classification;
  return { ref, classification, onClose };
}

const flush = () => act(async () => {});
const list = (level: string) => screen.getByRole("list", { name: `Valores de ${level}` });
const names = (level: string) => within(list(level)).getAllByRole("listitem").map((li) => li.textContent);

let library = cloneClassification(SUGGESTED_CLASSIFICATION);

beforeEach(() => {
  library = cloneClassification(SUGGESTED_CLASSIFICATION);
  library[1].values.push({ id: "v-lib-only", name: "Só na biblioteca" });
  window.mocquereau = {
    getClassification: vi.fn(async () => library),
    setClassification: vi.fn(async (c) => {
      library = c;
    }),
  } as never;
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("ClassificationDialog", () => {
  it("renames a level in place (Enter confirms) and carries the name to the library", async () => {
    const { classification } = mount(createNewProject("T", ""));
    fireEvent.click(screen.getByRole("button", { name: "Nome do nível 2" }));
    const input = screen.getByRole("textbox", { name: "Nome do nível 2" });
    fireEvent.change(input, { target: { value: "Origem" } });
    fireEvent.keyDown(input, { key: "Enter" });
    await flush();
    expect(classification()[1].name).toBe("Origem");
    expect(screen.getByRole("button", { name: "Nome do nível 2" }).textContent).toBe("Origem");
    expect(library[1].name).toBe("Origem");
    // Library-only values stay, after the project's.
    expect(library[1].values.at(-1)!.id).toBe("v-lib-only");
  });

  it("Alt+Down moves a value down; consecutive moves are one undo step", async () => {
    const { classification, ref } = mount(createNewProject("T", ""));
    const first = within(list("Tipo")).getByText("Adiastemática").closest("li")!;
    fireEvent.keyDown(first, { key: "ArrowDown", altKey: true });
    expect(names("Tipo")).toEqual(["Diastemática", "Adiastemática", "Quadrada", "Moderna"]);
    expect(document.activeElement?.textContent).toBe("Adiastemática");
    fireEvent.keyDown(document.activeElement!, { key: "ArrowDown", altKey: true });
    expect(classification()[0].values.map((v) => v.name)).toEqual(["Diastemática", "Quadrada", "Adiastemática", "Moderna"]);
    await flush();
    expect(library[0].values.map((v) => v.name)).toEqual(["Diastemática", "Quadrada", "Adiastemática", "Moderna"]);
    act(() => ref.history!.undo());
    expect(names("Tipo")).toEqual(["Adiastemática", "Diastemática", "Quadrada", "Moderna"]);
  });

  it("double click renames a value; 'Adicionar' adds one at the end", async () => {
    const { classification } = mount(createNewProject("T", ""));
    fireEvent.doubleClick(within(list("Família")).getByText("Laon"));
    const input = screen.getByRole("textbox", { name: "Nome do valor" });
    fireEvent.change(input, { target: { value: "Laon (Metz)" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(classification()[2].values[1]).toEqual({ id: "familia.laon", name: "Laon (Metz)" });

    const col = list("Família").closest("section")!;
    fireEvent.click(within(col).getByRole("button", { name: "Adicionar" }));
    const add = screen.getByRole("textbox", { name: "Novo valor" });
    fireEvent.change(add, { target: { value: "Moçárabe" } });
    fireEvent.keyDown(add, { key: "Enter" });
    fireEvent.blur(add);
    expect(classification()[2].values.filter((v) => v.name === "Moçárabe")).toHaveLength(1);
    expect(names("Família").at(-1)).toBe("Moçárabe");
    await flush();
    expect(library[2].values.find((v) => v.name === "Laon (Metz)")).toBeTruthy();
  });

  it("removing an unused value needs no confirmation and removes it from the library", async () => {
    const { classification } = mount(createNewProject("T", ""));
    const item = within(list("Região")).getByText("Inglesa").closest("li")!;
    fireEvent.contextMenu(item, { clientX: 10, clientY: 10 });
    fireEvent.click(screen.getByRole("menuitem", { name: "Remover…" }));
    expect(classification()[1].values.some((v) => v.id === "regiao.inglesa")).toBe(false);
    await flush();
    expect(library[1].values.some((v) => v.id === "regiao.inglesa")).toBe(false);
    expect(library[1].values.at(-1)!.id).toBe("v-lib-only");
  });

  it("removing a value in use confirms with the count, clears it in the sources, one undo step", async () => {
    const project = {
      ...createNewProject("T", ""),
      sources: [
        mkSource("A", ["tipo.quadrada", null, "familia.cisterciense"]),
        mkSource("B", ["tipo.quadrada", null, null]),
        mkSource("C", ["tipo.moderna", null, null]),
      ],
    };
    const { ref, classification } = mount(project);
    const item = within(list("Tipo")).getByText("Quadrada").closest("li")!;
    fireEvent.contextMenu(item, { clientX: 10, clientY: 10 });
    fireEvent.click(screen.getByRole("menuitem", { name: "Remover…" }));
    const confirm = screen.getByRole("dialog", { name: "Remover “Quadrada”?" });
    expect(confirm.textContent).toContain("2 fontes usam este valor");
    fireEvent.click(within(confirm).getByRole("button", { name: "Remover" }));
    const sources = ref.state!.project!.sources;
    expect(sources.map((s) => s.metadata.classes)).toEqual([
      [null, null, "familia.cisterciense"],
      [null, null, null],
      ["tipo.moderna", null, null],
    ]);
    expect(classification()[0].values.some((v) => v.id === "tipo.quadrada")).toBe(false);
    await flush();
    expect(library[0].values.some((v) => v.id === "tipo.quadrada")).toBe(false);
    expect(screen.getByRole("dialog", { name: "Classificação" })).toBeTruthy();
    act(() => ref.history!.undo());
    expect(ref.state!.project!.sources[1].metadata.classes[0]).toBe("tipo.quadrada");
    expect(classification()[0].values.some((v) => v.id === "tipo.quadrada")).toBe(true);
    expect(ref.history!.canUndo).toBe(false);
  });

  it("the confirmation uses the singular for one source", () => {
    mount({ ...createNewProject("T", ""), sources: [mkSource("A", ["tipo.moderna", null, null])] });
    fireEvent.keyDown(within(list("Tipo")).getByText("Moderna").closest("li")!, { key: "Delete" });
    expect(screen.getByRole("dialog").textContent).toContain("1 fonte usa este valor");
    fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));
    expect(names("Tipo")).toContain("Moderna");
  });

  it("'Concluído' closes", () => {
    const { onClose } = mount(createNewProject("T", ""));
    fireEvent.click(screen.getByRole("button", { name: "Concluído" }));
    expect(onClose).toHaveBeenCalledOnce();
  });
});
