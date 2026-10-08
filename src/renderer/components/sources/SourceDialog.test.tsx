// @vitest-environment jsdom
import "../../i18n";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { SourceDialog } from "./SourceDialog";
import {
  ProjectContext,
  createNewProject,
  useProjectReducer,
  type DocumentAction,
  type HistoryApi,
  type ProjectState,
} from "../../hooks/useProject";
import type { ManuscriptSource, MocquereauProject } from "../../lib/models";

function mkSource(over: Partial<ManuscriptSource["metadata"]> = {}): ManuscriptSource {
  return {
    id: "S1",
    order: 1,
    metadata: {
      siglum: "P",
      library: "",
      city: "Arouca",
      century: "1485",
      classes: [null, null, null],
      cantusId: "c-123",
      iiifManifest: "https://example.org/iiif/manifest.json",
      ...over,
    },
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
        <SourceDialog sourceId="S1" onClose={onClose} />
      </ProjectContext.Provider>
    );
  }
  render(<Harness />);
  act(() => ref.dispatch!({ type: "SET_PROJECT", payload: project }));
  const source = () => ref.state!.project!.sources.find((s) => s.id === "S1");
  return { ref, source, onClose };
}

const projectWith = (source: ManuscriptSource) => ({ ...createNewProject("T", ""), sources: [source] });
const flush = () => act(async () => {});

beforeEach(() => {
  window.mocquereau = {
    getClassification: vi.fn().mockResolvedValue(createNewProject("T", "").classification),
    setClassification: vi.fn().mockResolvedValue(undefined),
  } as never;
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("SourceDialog", () => {
  it("edits the siglum live, as one undo step per field, keeping hidden fields", () => {
    const { source, ref } = mount(projectWith(mkSource()));
    const siglum = screen.getByRole("textbox", { name: "Sigla" });
    for (const v of ["P-", "P-A", "P-AR"]) fireEvent.change(siglum, { target: { value: v } });
    expect(source()!.metadata.siglum).toBe("P-AR");
    expect(source()!.metadata.cantusId).toBe("c-123");
    expect(source()!.metadata.iiifManifest).toBe("https://example.org/iiif/manifest.json");
    act(() => ref.history!.undo());
    expect(source()!.metadata.siglum).toBe("P");
  });

  it("writes Data to century and Link to sourceUrl; an empty Link leaves no sourceUrl", () => {
    const { source } = mount(projectWith(mkSource({ sourceUrl: "https://a.org" })));
    fireEvent.change(screen.getByRole("textbox", { name: "Data" }), { target: { value: "s. XII" } });
    expect(source()!.metadata.century).toBe("s. XII");
    const link = screen.getByRole("textbox", { name: "Link" });
    expect((link as HTMLInputElement).value).toBe("https://a.org");
    fireEvent.change(link, { target: { value: "" } });
    expect("sourceUrl" in source()!.metadata).toBe(false);
    fireEvent.change(link, { target: { value: "https://b.org" } });
    expect(source()!.metadata.sourceUrl).toBe("https://b.org");
  });

  it("picks a class value per level, with an empty option", () => {
    const { source } = mount(projectWith(mkSource()));
    const tipo = screen.getByRole("combobox", { name: "Tipo" });
    fireEvent.change(tipo, { target: { value: "tipo.quadrada" } });
    expect(source()!.metadata.classes).toEqual(["tipo.quadrada", null, null]);
    fireEvent.change(tipo, { target: { value: "" } });
    expect(source()!.metadata.classes).toEqual([null, null, null]);
  });

  it("'Novo valor…' adds the value to the level, selects it, updates the library, one undo step", async () => {
    const { source, ref } = mount(projectWith(mkSource()));
    fireEvent.change(screen.getByRole("combobox", { name: "Família" }), { target: { value: "__new__" } });
    const input = screen.getByRole("textbox", { name: "Novo valor de Família" });
    expect(document.activeElement).toBe(input);
    fireEvent.change(input, { target: { value: "Moçárabe" } });
    fireEvent.keyDown(input, { key: "Enter" });
    await flush();
    const familia = ref.state!.project!.classification[2];
    const added = familia.values.at(-1)!;
    expect(added.name).toBe("Moçárabe");
    expect(source()!.metadata.classes[2]).toBe(added.id);
    expect((screen.getByRole("combobox", { name: "Família" }) as HTMLSelectElement).value).toBe(added.id);
    const saved = vi.mocked(window.mocquereau.setClassification).mock.calls[0][0];
    expect(saved[2].values.at(-1)).toEqual(added);
    // The dialog stays open: Enter in the field adds, it does not close.
    expect(screen.getByRole("dialog")).toBeTruthy();
    act(() => ref.history!.undo());
    expect(ref.state!.project!.classification[2].values.some((v) => v.id === added.id)).toBe(false);
    expect(source()!.metadata.classes[2]).toBe(null);
  });

  it("Escape in 'Novo valor' cancels without closing the dialog", () => {
    const { ref, onClose } = mount(projectWith(mkSource()));
    const before = ref.state!.project!.classification;
    fireEvent.change(screen.getByRole("combobox", { name: "Região" }), { target: { value: "__new__" } });
    const input = screen.getByRole("textbox", { name: "Novo valor de Região" });
    fireEvent.change(input, { target: { value: "x" } });
    fireEvent.keyDown(input, { key: "Escape" });
    expect(onClose).not.toHaveBeenCalled();
    expect(ref.state!.project!.classification).toBe(before);
    expect(screen.getByRole("combobox", { name: "Região" })).toBeTruthy();
  });

  it("'Excluir fonte…' asks first, then removes the source and closes", () => {
    const { source, onClose } = mount(projectWith(mkSource()));
    fireEvent.click(screen.getByRole("button", { name: "Excluir fonte…" }));
    expect(source()).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));
    expect(screen.getByRole("textbox", { name: "Sigla" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Excluir fonte…" }));
    fireEvent.click(screen.getByRole("button", { name: "Excluir" }));
    expect(source()).toBeUndefined();
    expect(onClose).toHaveBeenCalled();
  });

  it("Escape, Enter in a field and 'Concluído' close", () => {
    const { onClose } = mount(projectWith(mkSource()));
    fireEvent.keyDown(screen.getByRole("textbox", { name: "Cidade" }), { key: "Enter" });
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
    fireEvent.click(screen.getByRole("button", { name: "Concluído" }));
    expect(onClose).toHaveBeenCalledTimes(3);
  });
});
