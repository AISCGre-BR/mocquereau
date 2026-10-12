// @vitest-environment jsdom
import "../../i18n";
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import i18n from "../../i18n";
import { VocabularyDialog } from "./VocabularyDialog";
import {
  ProjectContext,
  createNewProject,
  useProjectReducer,
  type DocumentAction,
  type HistoryApi,
  type ProjectState,
} from "../../hooks/useProject";
import { filterKinds, getVocabulary, kindMap } from "@shared/annotation/vocabulary";
import type { NeumeVocabulary } from "@shared/annotation/types";

const tr = (k: string) => i18n.t(k);

function mount(onClose = vi.fn()) {
  const ref: { state?: ProjectState; dispatch?: React.Dispatch<DocumentAction>; history?: HistoryApi } = {};
  function Harness() {
    const [state, dispatch, history] = useProjectReducer();
    Object.assign(ref, { state, dispatch, history });
    if (!state.project) return null;
    return (
      <ProjectContext.Provider value={{ state, dispatch, history }}>
        <VocabularyDialog onClose={onClose} />
      </ProjectContext.Provider>
    );
  }
  render(<Harness />);
  act(() => ref.dispatch!({ type: "SET_PROJECT", payload: createNewProject("T", "") }));
  return {
    ref,
    onClose,
    saved: () => ref.state!.project!.neumeVocabulary,
    vocab: () => getVocabulary(ref.state!.project!, tr),
  };
}

const categoryButton = (name: string) => screen.getByRole("button", { name: new RegExp(`^${name}`) });
const kindRow = (name: string) => screen.getByText(name, { selector: "td [data-kind-name]" }).closest("tr")!;

afterEach(cleanup);

describe("VocabularyDialog", () => {
  it("opens on a project without vocabulary showing the default, without saving or dirtying", () => {
    const { ref, saved } = mount();
    expect(saved()).toBeUndefined();
    expect(ref.state!.isDirty).toBe(false);
    expect(categoryButton("Simples")).toBeTruthy();
    expect(kindRow("virga")).toBeTruthy();
    expect(saved()).toBeUndefined();
  });

  it("renaming a category saves the whole vocabulary into the project", () => {
    const { saved, ref } = mount();
    const btn = categoryButton("Simples");
    fireEvent.keyDown(btn, { key: "F2" });
    const input = screen.getByRole("textbox", { name: "Categoria" });
    fireEvent.change(input, { target: { value: "Elementares" } });
    fireEvent.keyDown(input, { key: "Enter" });
    const v = saved() as NeumeVocabulary;
    expect(v.categories.find((c) => c.id === "cat.simple")!.name).toBe("Elementares");
    expect(v.kinds.length).toBeGreaterThan(20);
    expect(ref.state!.isDirty).toBe(true);
  });

  it("'Equivale a' accepts a kind by name and saves its id; empty removes it", () => {
    const { vocab } = mount();
    fireEvent.doubleClick(kindRow("gravis"));
    const eq = screen.getByRole("combobox", { name: "Equivale a" });
    fireEvent.change(eq, { target: { value: "punctum" } });
    expect(eq.getAttribute("aria-invalid")).toBeNull();
    fireEvent.keyDown(eq, { key: "Enter" });
    expect(kindMap(vocab()).get("gravis")!.equivalentTo).toBe("punctum");
    fireEvent.doubleClick(kindRow("gravis"));
    const eq2 = screen.getByRole("combobox", { name: "Equivale a" });
    fireEvent.change(eq2, { target: { value: "" } });
    fireEvent.keyDown(eq2, { key: "Enter" });
    expect(kindMap(vocab()).get("gravis")!.equivalentTo).toBeUndefined();
  });

  it("'Equivale a' that closes a cycle (tractulus = uncinus) is aria-invalid and is not saved", () => {
    const { saved } = mount();
    fireEvent.doubleClick(kindRow("tractulus"));
    const eq = screen.getByRole("combobox", { name: "Equivale a" });
    fireEvent.change(eq, { target: { value: "uncinus" } });
    expect(eq.getAttribute("aria-invalid")).toBe("true");
    fireEvent.keyDown(eq, { key: "Enter" });
    expect(saved()).toBeUndefined();
    // Itself and unknown names are invalid too.
    fireEvent.change(eq, { target: { value: "tractulus" } });
    expect(eq.getAttribute("aria-invalid")).toBe("true");
    fireEvent.change(eq, { target: { value: "inexistente" } });
    expect(eq.getAttribute("aria-invalid")).toBe("true");
  });

  it("hiding climacus removes it from the kinds offered (filterKinds), keeps the others", () => {
    const { vocab } = mount();
    fireEvent.click(categoryButton("Compostos"));
    fireEvent.click(within(kindRow("climacus")).getByRole("button", { name: "Ações" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Ocultar" }));
    const names = filterKinds(vocab(), "cl").flatMap((g) => g.kinds.map((k) => k.name));
    expect(names).toContain("clivis");
    expect(names).not.toContain("climacus");
    expect(screen.getByText("climacus", { selector: "td [data-kind-name]" })).toBeTruthy();
    // Shows again.
    fireEvent.click(within(kindRow("climacus")).getByRole("button", { name: "Ações" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Mostrar" }));
    expect(filterKinds(vocab(), "climacus")).toHaveLength(1);
  });

  it("'+ Neuma' adds a kind with a kind.<uuid> id to the selected category", () => {
    const { vocab } = mount();
    fireEvent.click(categoryButton("Ornamentais e repercussivos"));
    fireEvent.click(screen.getByRole("button", { name: "Neuma" }));
    const name = screen.getByRole("textbox", { name: "Nome" });
    fireEvent.change(name, { target: { value: "quilisma novo" } });
    fireEvent.change(screen.getByRole("spinbutton", { name: "Notas" }), { target: { value: "3" } });
    fireEvent.keyDown(name, { key: "Enter" });
    const added = vocab().kinds.find((k) => k.name === "quilisma novo")!;
    expect(added.id).toMatch(/^kind\./);
    expect(added.categoryId).toBe("cat.ornamental");
    expect(added.defaultNotes).toBe(3);
  });

  it("notes are optional: empty saves the kind without default notes; typed must be an integer >= 1", () => {
    const { vocab } = mount();
    fireEvent.click(screen.getByRole("button", { name: "Neuma" }));
    const name = screen.getByRole("textbox", { name: "Nome" });
    const notes = screen.getByRole("spinbutton", { name: "Notas" }) as HTMLInputElement;
    expect(notes.value).toBe("");
    fireEvent.change(name, { target: { value: "novo" } });
    expect(notes.getAttribute("aria-invalid")).toBeNull();
    const count = vocab().kinds.length;
    fireEvent.change(notes, { target: { value: "0" } });
    expect(notes.getAttribute("aria-invalid")).toBe("true");
    fireEvent.keyDown(name, { key: "Enter" });
    expect(vocab().kinds).toHaveLength(count);
    fireEvent.change(notes, { target: { value: "" } });
    fireEvent.keyDown(name, { key: "Enter" });
    const added = vocab().kinds.find((k) => k.name === "novo")!;
    expect(added.categoryId).toBe("cat.simple");
    expect("defaultNotes" in added).toBe(false);
    expect(kindRow("novo").querySelectorAll("td")[1].textContent).toBe("");
  });

  it("clearing the notes of an existing kind removes its default notes", () => {
    const { vocab } = mount();
    fireEvent.doubleClick(kindRow("virga"));
    const notes = screen.getByRole("spinbutton", { name: "Notas" });
    fireEvent.change(notes, { target: { value: "" } });
    expect(notes.getAttribute("aria-invalid")).toBeNull();
    fireEvent.keyDown(notes, { key: "Enter" });
    expect("defaultNotes" in kindMap(vocab()).get("virga")!).toBe(false);
  });

  it("'Sem categoria' comes last, lists uncategorized kinds and has no actions", () => {
    const { ref, vocab } = mount();
    const base = vocab();
    act(() =>
      ref.dispatch!({
        type: "SET_NEUME_VOCABULARY",
        payload: { ...base, kinds: [...base.kinds, { id: "solto", name: "solto" }, { id: "orfao", categoryId: "cat.nada", name: "orfao" }] },
      }),
    );
    const items = within(screen.getByRole("list", { name: "Categorias" })).getAllByRole("listitem");
    const last = items[items.length - 1];
    expect(last.textContent).toBe("Sem categoria");
    expect(within(last).queryByRole("button", { name: "Ações" })).toBeNull();
    fireEvent.doubleClick(within(last).getByRole("button", { name: "Sem categoria" }));
    expect(screen.queryByRole("textbox", { name: "Categoria" })).toBeNull();
    fireEvent.click(within(last).getByRole("button", { name: "Sem categoria" }));
    expect(kindRow("solto")).toBeTruthy();
    expect(kindRow("orfao")).toBeTruthy();
    expect(screen.queryByText("virga", { selector: "td [data-kind-name]" })).toBeNull();
  });

  it("'+ Neuma' with 'Sem categoria' selected creates an uncategorized kind", () => {
    const { vocab } = mount();
    fireEvent.click(screen.getByRole("button", { name: "Sem categoria" }));
    fireEvent.click(screen.getByRole("button", { name: "Neuma" }));
    const name = screen.getByRole("textbox", { name: "Nome" });
    fireEvent.change(name, { target: { value: "avulso" } });
    fireEvent.keyDown(name, { key: "Enter" });
    expect(vocab().kinds.find((k) => k.name === "avulso")).toEqual({ id: expect.stringMatching(/^kind\./), name: "avulso" });
    expect(kindRow("avulso")).toBeTruthy();
  });

  it("moves a kind into 'Sem categoria' and back into a category", () => {
    const { vocab } = mount();
    fireEvent.click(within(kindRow("punctum")).getByRole("button", { name: "Ações" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Mover para categoria" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Sem categoria" }));
    expect("categoryId" in kindMap(vocab()).get("punctum")!).toBe(false);
    fireEvent.click(screen.getByRole("button", { name: "Sem categoria" }));
    fireEvent.click(within(kindRow("punctum")).getByRole("button", { name: "Ações" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Mover para categoria" }));
    expect(screen.queryByRole("menuitem", { name: "Sem categoria" })).toBeNull();
    fireEvent.click(screen.getByRole("menuitem", { name: "Compostos" }));
    expect(kindMap(vocab()).get("punctum")!.categoryId).toBe("cat.compound");
  });

  it("kind names are unique (accent and case insensitive) when adding or renaming", () => {
    const { vocab, saved } = mount();
    fireEvent.click(screen.getByRole("button", { name: "Neuma" }));
    const name = screen.getByRole("textbox", { name: "Nome" });
    fireEvent.change(screen.getByRole("spinbutton", { name: "Notas" }), { target: { value: "1" } });
    fireEvent.change(name, { target: { value: "VIRGA" } });
    expect(name.getAttribute("aria-invalid")).toBe("true");
    fireEvent.keyDown(name, { key: "Enter" });
    expect(saved()).toBeUndefined();
    fireEvent.keyDown(name, { key: "Escape" });

    fireEvent.doubleClick(kindRow("gravis"));
    const rename = screen.getByRole("textbox", { name: "Nome" });
    fireEvent.change(rename, { target: { value: "Punctum" } });
    expect(rename.getAttribute("aria-invalid")).toBe("true");
    fireEvent.keyDown(rename, { key: "Enter" });
    expect(saved()).toBeUndefined();
    fireEvent.change(rename, { target: { value: "Gravis" } });
    expect(rename.getAttribute("aria-invalid")).toBeNull();
    fireEvent.keyDown(rename, { key: "Enter" });
    expect(vocab().kinds.find((k) => k.id === "gravis")!.name).toBe("Gravis");
  });

  it("moves a kind to another category and up/down within the category", () => {
    const { vocab } = mount();
    fireEvent.click(within(kindRow("punctum")).getByRole("button", { name: "Ações" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Mover para cima" }));
    const simple = vocab().kinds.filter((k) => k.categoryId === "cat.simple").map((k) => k.name);
    expect(simple.slice(0, 3)).toEqual(["virga", "punctum", "tractulus"]);
    fireEvent.click(within(kindRow("punctum")).getByRole("button", { name: "Ações" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Mover para categoria" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Compostos" }));
    expect(kindMap(vocab()).get("punctum")!.categoryId).toBe("cat.compound");
  });

  it("hides a category and moves it down", () => {
    const { vocab } = mount();
    const row = categoryButton("Simples").closest("li")!;
    fireEvent.click(within(row).getByRole("button", { name: "Ações" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Ocultar" }));
    expect(vocab().categories[0].hidden).toBe(true);
    expect(categoryButton("Simples").textContent).toContain("oculta");
    fireEvent.click(within(categoryButton("Simples").closest("li")!).getByRole("button", { name: "Ações" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Mover para baixo" }));
    expect(vocab().categories.map((c) => c.id).slice(0, 2)).toEqual(["cat.compound", "cat.simple"]);
  });

  it("'+ Categoria' creates a category with the typed name", () => {
    const { vocab } = mount();
    fireEvent.click(screen.getByRole("button", { name: "Categoria" }));
    const input = screen.getByRole("textbox", { name: "Categoria" });
    fireEvent.change(input, { target: { value: "Próprias" } });
    fireEvent.keyDown(input, { key: "Enter" });
    const added = vocab().categories.at(-1)!;
    expect(added.name).toBe("Próprias");
    expect(added.id).toMatch(/^cat\./);
  });

  it("letters tab: hides a letter and adds one", () => {
    const { vocab } = mount();
    fireEvent.click(screen.getByRole("tab", { name: "Letras" }));
    const cRow = screen.getByText("c", { selector: "td [data-letter-abbr]" }).closest("tr")!;
    fireEvent.click(within(cRow).getByRole("button", { name: "Ações" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Ocultar" }));
    expect(vocab().letters.find((l) => l.id === "letter.c")!.hidden).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "Letra" }));
    const abbr = screen.getByRole("textbox", { name: "Abreviação" });
    fireEvent.change(abbr, { target: { value: "zz" } });
    fireEvent.change(screen.getByRole("textbox", { name: "Sentido" }), { target: { value: "zelose" } });
    fireEvent.keyDown(abbr, { key: "Enter" });
    expect(vocab().letters.at(-1)).toMatchObject({ abbr: "zz", meaning: "zelose" });
  });

  it("'Restaurar padrão' brings back a deleted default kind and keeps created ones", () => {
    const { ref, vocab } = mount();
    const base = vocab();
    const custom = { id: "kind.mine", categoryId: "cat.simple", name: "meu", defaultNotes: 1 };
    act(() =>
      ref.dispatch!({
        type: "SET_NEUME_VOCABULARY",
        payload: { ...base, kinds: [...base.kinds.filter((k) => k.id !== "pes"), custom] },
      }),
    );
    expect(vocab().kinds.some((k) => k.id === "pes")).toBe(false);
    fireEvent.click(screen.getByRole("button", { name: "Restaurar padrão" }));
    expect(vocab().kinds.some((k) => k.id === "pes")).toBe(true);
    expect(vocab().kinds.some((k) => k.id === "kind.mine")).toBe(true);
  });

  it("'Concluído' closes", () => {
    const { onClose } = mount();
    fireEvent.click(screen.getByRole("button", { name: "Concluído" }));
    expect(onClose).toHaveBeenCalledOnce();
  });
});
