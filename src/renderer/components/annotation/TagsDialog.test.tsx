// @vitest-environment jsdom
import "../../i18n";
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { TagsDialog } from "./TagsDialog";
import {
  ProjectContext,
  createNewProject,
  useProjectReducer,
  type DocumentAction,
  type HistoryApi,
  type ProjectState,
} from "../../hooks/useProject";
import type { ManuscriptSource, MocquereauProject } from "../../lib/models";

const source: ManuscriptSource = {
  id: "S",
  order: 1,
  metadata: { siglum: "S", library: "", city: "", century: "", classes: [null, null, null] },
  lines: [],
  syllableCuts: {},
  annotations: {
    0: { neumes: [{ kind: "pes" }], tags: ["t-a", "t-b"] },
    1: { neumes: [{ kind: "virga", tags: ["t-b"] }], tags: ["t-b"] },
  },
};

function project(): MocquereauProject {
  return {
    ...createNewProject("T", ""),
    tags: [
      { id: "t-z", name: "Zeta" },
      { id: "t-a", name: "Alfa", group: "Escrita" },
      { id: "t-b", name: "Beta", group: "Escrita" },
      { id: "t-c", name: "Gama", group: "Ar" },
    ],
    sources: [source],
  };
}

function mount(p: MocquereauProject, onClose = vi.fn()) {
  const ref: { state?: ProjectState; dispatch?: React.Dispatch<DocumentAction>; history?: HistoryApi } = {};
  function Harness() {
    const [state, dispatch, history] = useProjectReducer();
    Object.assign(ref, { state, dispatch, history });
    if (!state.project) return null;
    return (
      <ProjectContext.Provider value={{ state, dispatch, history }}>
        <TagsDialog onClose={onClose} />
      </ProjectContext.Provider>
    );
  }
  render(<Harness />);
  act(() => ref.dispatch!({ type: "SET_PROJECT", payload: p }));
  return { ref, onClose, tags: () => ref.state!.project!.tags! };
}

const row = (name: string) => screen.getByText(name, { selector: "[data-tag-name]" }).closest("li")!;
const openMenu = (name: string, item: string) => {
  fireEvent.click(within(row(name)).getByRole("button", { name: "Ações da etiqueta" }));
  fireEvent.click(screen.getByRole("menuitem", { name: item }));
};

afterEach(cleanup);

describe("TagsDialog", () => {
  it("groups by group alphabetically with 'Sem grupo' last", () => {
    mount(project());
    const heads = screen.getAllByRole("heading", { level: 3 }).map((h) => h.textContent);
    expect(heads).toEqual(["Ar", "Escrita", "Sem grupo"]);
    const names = screen.getAllByRole("listitem").map((li) => li.querySelector("[data-tag-name]")!.textContent);
    expect(names).toEqual(["Gama", "Alfa", "Beta", "Zeta"]);
  });

  it("creates a tag with Enter in 'Nova etiqueta'; duplicates and empty are ignored", () => {
    const { tags } = mount(project());
    const input = screen.getByRole("textbox", { name: "Nova etiqueta" });
    fireEvent.change(input, { target: { value: "  Delta " } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(tags().map((t) => t.name)).toContain("Delta");
    fireEvent.change(input, { target: { value: "alfa" } });
    fireEvent.keyDown(input, { key: "Enter" });
    fireEvent.change(input, { target: { value: "  " } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(tags()).toHaveLength(5);
  });

  it("renames in place (double click, Enter saves); empty or duplicate does not save; Esc cancels", () => {
    const { tags } = mount(project());
    fireEvent.doubleClick(row("Zeta"));
    let input = screen.getByRole("textbox", { name: "Nome" });
    fireEvent.change(input, { target: { value: "Ômega" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(tags().find((t) => t.id === "t-z")!.name).toBe("Ômega");

    fireEvent.doubleClick(row("Ômega"));
    input = screen.getByRole("textbox", { name: "Nome" });
    fireEvent.change(input, { target: { value: "alfa" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(tags().find((t) => t.id === "t-z")!.name).toBe("Ômega");

    fireEvent.doubleClick(row("Ômega"));
    input = screen.getByRole("textbox", { name: "Nome" });
    fireEvent.change(input, { target: { value: "Xis" } });
    fireEvent.keyDown(input, { key: "Escape" });
    expect(tags().find((t) => t.id === "t-z")!.name).toBe("Ômega");
  });

  it("edits the group in the same row; clearing it removes the group", () => {
    const { tags } = mount(project());
    fireEvent.doubleClick(row("Zeta"));
    const group = screen.getByRole("textbox", { name: "Grupo" });
    fireEvent.change(group, { target: { value: "Ar" } });
    fireEvent.keyDown(group, { key: "Enter" });
    expect(tags().find((t) => t.id === "t-z")!.group).toBe("Ar");
    fireEvent.doubleClick(row("Zeta"));
    const g2 = screen.getByRole("textbox", { name: "Grupo" });
    fireEvent.change(g2, { target: { value: "" } });
    fireEvent.keyDown(g2, { key: "Enter" });
    expect(tags().find((t) => t.id === "t-z")!.group).toBeUndefined();
  });

  it("edits the description from the menu", () => {
    const { tags } = mount(project());
    openMenu("Alfa", "Descrição…");
    const area = screen.getByRole("textbox", { name: "Descrição" });
    fireEvent.change(area, { target: { value: "Tinta vermelha" } });
    fireEvent.blur(area);
    expect(tags().find((t) => t.id === "t-a")!.description).toBe("Tinta vermelha");
  });

  it("merges into another tag: annotations point to the target, one undo step", () => {
    const { ref, tags } = mount(project());
    fireEvent.click(within(row("Alfa")).getByRole("button", { name: "Ações da etiqueta" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Juntar com…" }));
    const sub = screen.getByRole("menu", { name: "Juntar com…" });
    const offered = within(sub).getAllByRole("menuitem").map((b) => b.textContent!.trim());
    expect(offered).not.toContain("Alfa");
    expect(offered).toHaveLength(3);
    fireEvent.click(within(sub).getByRole("menuitem", { name: "Beta" }));
    expect(tags().map((t) => t.id)).toEqual(["t-z", "t-b", "t-c"]);
    expect(ref.state!.project!.sources[0].annotations![0].tags).toEqual(["t-b"]);
    act(() => ref.history!.undo());
    expect(tags()).toHaveLength(4);
    expect(ref.state!.project!.sources[0].annotations![0].tags).toEqual(["t-a", "t-b"]);
  });

  it("deleting an unused tag is direct", () => {
    const { tags } = mount(project());
    openMenu("Zeta", "Excluir…");
    expect(screen.queryByRole("dialog", { name: /Excluir/ })).toBeNull();
    expect(tags().some((t) => t.id === "t-z")).toBe(false);
  });

  it("deleting a tag in use confirms with the count; one undo restores everything", () => {
    const { ref, tags } = mount(project());
    openMenu("Beta", "Excluir…");
    const confirm = screen.getByRole("dialog", { name: "Excluir “Beta”?" });
    expect(confirm.textContent).toContain("2 anotações");
    fireEvent.click(within(confirm).getByRole("button", { name: "Cancelar" }));
    expect(tags()).toHaveLength(4);
    openMenu("Beta", "Excluir…");
    fireEvent.click(screen.getByRole("button", { name: "Excluir" }));
    expect(tags().some((t) => t.id === "t-b")).toBe(false);
    expect(ref.state!.project!.sources[0].annotations![0].tags).toEqual(["t-a"]);
    expect(screen.getByRole("dialog", { name: "Etiquetas" })).toBeTruthy();
    act(() => ref.history!.undo());
    expect(tags()).toHaveLength(4);
    expect(ref.state!.project!.sources[0].annotations![1].tags).toEqual(["t-b"]);
  });

  it("'Concluir' closes", () => {
    const { onClose } = mount(project());
    fireEvent.click(screen.getByRole("button", { name: "Concluir" }));
    expect(onClose).toHaveBeenCalledOnce();
  });
});
