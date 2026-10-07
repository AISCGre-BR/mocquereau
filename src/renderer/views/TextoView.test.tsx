// @vitest-environment jsdom
import "../i18n";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useEffect } from "react";
import { TextoView } from "./TextoView";
import { ProjectContext, createNewProject, useProjectReducer, type HistoryApi } from "../hooks/useProject";
import { syllabifyText } from "../lib/syllabify";
import type { ManuscriptSource, MocquereauAPI, MocquereauProject, Section, SyllableBox } from "../lib/models";
import ptBR from "../i18n/locales/pt-BR.json";

let latest: { isDirty: boolean; project: MocquereauProject | null } = { isDirty: false, project: null };
let latestHistory: HistoryApi | null = null;
const onAddSource = vi.fn();
const onImportGueranger = vi.fn();

function Harness({ project, show }: { project: MocquereauProject; show: boolean }) {
  const [state, dispatch, history] = useProjectReducer();
  useEffect(() => {
    dispatch({ type: "SET_PROJECT", payload: project });
  }, [project]);
  latest = state;
  latestHistory = history;
  return (
    <ProjectContext.Provider value={{ state, dispatch }}>
      {show && state.project ? <TextoView onAddSource={onAddSource} onImportGueranger={onImportGueranger} /> : null}
    </ProjectContext.Provider>
  );
}

function projectWith(raw: string, words = syllabifyText(raw, "sung")): MocquereauProject {
  const base = createNewProject("Introito", "");
  return { ...base, text: { raw, words, hyphenationMode: "sung" } };
}

const BOX: SyllableBox[] = [0, 1, 2, 3, 4].map((i) => ({ x: i / 10, y: 0, w: 0.1, h: 1 }));

function withSource(project: MocquereauProject): MocquereauProject {
  const source: ManuscriptSource = {
    id: "s1",
    order: 0,
    metadata: { siglum: "X", library: "", city: "", century: "", classes: [null, null, null] },
    lines: [
      {
        id: "l1",
        image: { dataUrl: "data:image/png;base64,abc", width: 1, height: 1, mimeType: "image/png" },
        syllableRange: { start: 0, end: 4 },
        dividers: [],
        gaps: [],
        syllableBoxes: { 0: BOX[0], 1: BOX[1], 2: BOX[2], 3: BOX[3], 4: BOX[4] },
        confirmed: true,
      },
    ],
    syllableCuts: {},
  };
  return { ...project, sources: [source] };
}

const wait = (ms: number) => act(() => new Promise<void>((resolve) => setTimeout(resolve, ms)));
const textPlaceholder = ptBR["newProject.textPlaceholder"];

beforeEach(() => {
  window.mocquereau = { getRecent: vi.fn().mockResolvedValue([]), platform: "linux" } as unknown as MocquereauAPI;
  onAddSource.mockReset();
  onImportGueranger.mockReset();
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("TextoView: gravação das edições", () => {
  it("montar sobre um projeto não o marca como editado", async () => {
    render(<Harness project={projectWith("Puer natus est")} show />);
    await wait(400);
    expect(latest.isDirty).toBe(false);
  });

  it("sílabas editadas fora da silabificação automática são preservadas ao montar", async () => {
    const manual = [
      { original: "Puer", syllables: ["Puer"] },
      { original: "natus", syllables: ["natus"] },
      { original: "est", syllables: ["est"] },
    ];
    render(<Harness project={projectWith("Puer natus est", manual)} show />);
    await wait(400);
    expect(latest.isDirty).toBe(false);
    expect(latest.project?.text.words).toEqual(manual);
  });

  it("título digitado e vista trocada antes de 300 ms não se perde", () => {
    const project = projectWith("Puer natus est");
    const { rerender } = render(<Harness project={project} show />);
    fireEvent.change(screen.getByPlaceholderText(ptBR["texto.titlePlaceholder"]), {
      target: { value: "Introito do Natal" },
    });
    rerender(<Harness project={project} show={false} />);
    expect(latest.project?.meta.title).toBe("Introito do Natal");
  });

  it("título digitado é gravado depois do debounce", async () => {
    render(<Harness project={projectWith("Puer natus est")} show />);
    fireEvent.change(screen.getByPlaceholderText(ptBR["newProject.authorPlaceholder"]), {
      target: { value: "Anônimo" },
    });
    expect(latest.project?.meta.author).toBe("");
    await wait(400);
    expect(latest.project?.meta.author).toBe("Anônimo");
  });

  it("texto digitado no editor e vista trocada antes de sair do editor é gravado com as sílabas", () => {
    const project = projectWith("Puer natus est");
    const { rerender } = render(<Harness project={project} show />);
    fireEvent.doubleClick(screen.getByTestId("texto-body"));
    fireEvent.change(screen.getByPlaceholderText(textPlaceholder), { target: { value: "Puer natus est nobis" } });
    rerender(<Harness project={project} show={false} />);
    expect(latest.isDirty).toBe(true);
    expect(latest.project?.text.raw).toBe("Puer natus est nobis");
    expect(latest.project?.text.words).toEqual(syllabifyText("Puer natus est nobis", "sung"));
  });

  it("texto pendente com sílabas manuais pergunta ao sair da vista; recusado, o projeto fica como estava", () => {
    const manual = [
      { original: "Puer", syllables: ["Puer"] },
      { original: "natus", syllables: ["natus"] },
      { original: "est", syllables: ["est"] },
    ];
    const project = projectWith("Puer natus est", manual);
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    const { rerender } = render(<Harness project={project} show />);
    fireEvent.doubleClick(screen.getByTestId("texto-body"));
    fireEvent.change(screen.getByPlaceholderText(textPlaceholder), { target: { value: "Puer natus" } });
    rerender(<Harness project={project} show={false} />);
    expect(confirm).toHaveBeenCalledWith(ptBR["texto.confirmDiscardManualEdits"]);
    expect(latest.project?.text.raw).toBe("Puer natus est");
    expect(latest.project?.text.words).toEqual(manual);
    expect(latest.isDirty).toBe(false);
  });

  it("texto pendente que muda as caixas pede a confirmação da migração ao sair da vista", () => {
    const project = withSource(projectWith("Puer natus est"));
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    const { rerender } = render(<Harness project={project} show />);
    fireEvent.keyDown(window, { key: "E", ctrlKey: true, shiftKey: true });
    fireEvent.change(screen.getByPlaceholderText(textPlaceholder), { target: { value: "Puer natus est nobis" } });
    rerender(<Harness project={project} show={false} />);
    expect(confirm).toHaveBeenCalledTimes(1);
    expect(latest.project?.text.raw).toBe("Puer natus est");
  });

  it("sem edição, sair da vista não grava nada", () => {
    const project = projectWith("Puer natus est");
    const { rerender } = render(<Harness project={project} show />);
    rerender(<Harness project={project} show={false} />);
    expect(latest.isDirty).toBe(false);
  });
});

describe("TextoView: sílabas, texto e modo", () => {
  it("merging two syllables dispatches a remapped project", () => {
    render(<Harness project={withSource(projectWith("Puer natus est"))} show />);
    fireEvent.click(screen.getAllByRole("button", { name: ptBR["syllableText.merge"] })[0]);
    expect(latest.project?.text.words[0].syllables).toEqual(["Puer"]);
    const boxes = latest.project?.sources[0].lines[0].syllableBoxes;
    expect(boxes?.[1]).toEqual(BOX[2]);
    expect(latest.isDirty).toBe(true);
  });

  it("double click opens the raw editor and blur re-syllabifies", () => {
    render(<Harness project={projectWith("Puer natus est")} show />);
    fireEvent.doubleClick(screen.getByTestId("texto-body"));
    const editor = screen.getByPlaceholderText(textPlaceholder);
    expect(document.activeElement).toBe(editor);
    fireEvent.change(editor, { target: { value: "Puer natus est nobis" } });
    fireEvent.blur(editor);
    expect(screen.queryByPlaceholderText(textPlaceholder)).toBeNull();
    expect(latest.project?.text.raw).toBe("Puer natus est nobis");
    expect(latest.project?.text.words).toEqual(syllabifyText("Puer natus est nobis", "sung"));
    expect(screen.getByTestId("word-3")).toBeTruthy();
  });

  it("double click on a word does not open the editor", () => {
    render(<Harness project={projectWith("Puer natus est")} show />);
    fireEvent.doubleClick(screen.getByTestId("word-1"));
    expect(screen.queryByPlaceholderText(textPlaceholder)).toBeNull();
  });

  it("Ctrl+Shift+E opens the editor and Esc leaves it", () => {
    render(<Harness project={projectWith("Puer natus est")} show />);
    fireEvent.keyDown(window, { key: "E", ctrlKey: true, shiftKey: true });
    const editor = screen.getByPlaceholderText(textPlaceholder);
    fireEvent.keyDown(editor, { key: "Escape" });
    expect(screen.queryByPlaceholderText(textPlaceholder)).toBeNull();
    expect(latest.isDirty).toBe(false);
  });

  it("the editor does not apply when the window loses focus, nor on Esc while composing", () => {
    render(<Harness project={projectWith("Puer natus est")} show />);
    fireEvent.doubleClick(screen.getByTestId("texto-body"));
    const editor = screen.getByPlaceholderText(textPlaceholder);
    fireEvent.change(editor, { target: { value: "Puer natus est nobis" } });
    fireEvent.keyDown(editor, { key: "Escape", isComposing: true });
    const hasFocus = vi.spyOn(document, "hasFocus").mockReturnValue(false);
    fireEvent.blur(editor);
    hasFocus.mockRestore();
    expect(screen.getByPlaceholderText(textPlaceholder)).toBeTruthy();
    expect(latest.project?.text.raw).toBe("Puer natus est");
  });

  it("project without text opens in the editor", () => {
    render(<Harness project={projectWith("")} show />);
    expect(screen.getByPlaceholderText(textPlaceholder)).toBeTruthy();
  });

  it("editing the text with manual syllables asks before discarding them", () => {
    const manual = [
      { original: "Puer", syllables: ["Puer"] },
      { original: "natus", syllables: ["natus"] },
      { original: "est", syllables: ["est"] },
    ];
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    render(<Harness project={projectWith("Puer natus est", manual)} show />);
    fireEvent.doubleClick(screen.getByTestId("texto-body"));
    const editor = screen.getByPlaceholderText(textPlaceholder);
    fireEvent.change(editor, { target: { value: "Puer natus" } });
    fireEvent.blur(editor);
    expect(confirm).toHaveBeenCalledWith(ptBR["texto.confirmDiscardManualEdits"]);
    expect(latest.project?.text.words).toEqual(manual);
    expect(screen.getByPlaceholderText(textPlaceholder)).toBeTruthy();
  });

  it("mode select changes the mode", () => {
    render(<Harness project={projectWith("Puer natus est")} show />);
    fireEvent.change(screen.getByLabelText(ptBR["texto.syllabification"]), { target: { value: "classical" } });
    expect(latest.project?.text.hyphenationMode).toBe("classical");
    expect(latest.project?.text.words).toEqual(syllabifyText("Puer natus est", "classical"));
  });

  it("mode change with boxes confirms and migrates", () => {
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(true);
    render(<Harness project={withSource(projectWith("Puer natus est"))} show />);
    fireEvent.change(screen.getByLabelText(ptBR["texto.syllabification"]), { target: { value: "classical" } });
    expect(confirm).toHaveBeenCalledTimes(1);
    expect(latest.project?.text.hyphenationMode).toBe("classical");
  });
});

describe("TextoView: próximos passos", () => {
  it("shows next-step actions only without sources", () => {
    const { unmount } = render(<Harness project={projectWith("Puer natus est")} show />);
    fireEvent.click(screen.getByRole("button", { name: ptBR["texto.addSource"] }));
    fireEvent.click(screen.getByRole("button", { name: ptBR["shell.file.importGueranger"] }));
    expect(onAddSource).toHaveBeenCalledTimes(1);
    expect(onImportGueranger).toHaveBeenCalledTimes(1);
    unmount();
    render(<Harness project={withSource(projectWith("Puer natus est"))} show />);
    expect(screen.queryByRole("button", { name: ptBR["texto.addSource"] })).toBeNull();
    expect(screen.queryByRole("button", { name: ptBR["shell.file.importGueranger"] })).toBeNull();
  });
});

describe("TextoView: seções", () => {
  const RAW = "Gloria in excelsis Deo et in terra pax hominibus";

  it("starts a section from the word context menu", async () => {
    render(<Harness project={projectWith(RAW)} show />);
    fireEvent.contextMenu(screen.getByTestId("word-4"));
    fireEvent.click(screen.getByRole("menuitem", { name: ptBR["texto.section.start"] }));
    fireEvent.change(screen.getByLabelText(ptBR["texto.section.name"]), { target: { value: "Intonação" } });
    fireEvent.click(screen.getByRole("button", { name: ptBR["texto.section.save"] }));
    const sections = latest.project?.sections ?? [];
    expect(sections).toHaveLength(1);
    expect(sections[0].name).toBe("Intonação");
    expect(sections[0].wordRange).toEqual([4, 8]);
    expect(await screen.findByText("Intonação")).toBeTruthy();
  });

  it("a section started inside another one ends the previous one before it", () => {
    const first: Section = { id: "a", name: "Gloria", wordRange: [0, 8] };
    render(<Harness project={{ ...projectWith(RAW), sections: [first] }} show />);
    fireEvent.contextMenu(screen.getByTestId("word-4"));
    fireEvent.click(screen.getByRole("menuitem", { name: ptBR["texto.section.start"] }));
    fireEvent.change(screen.getByLabelText(ptBR["texto.section.name"]), { target: { value: "Et in terra" } });
    fireEvent.keyDown(screen.getByLabelText(ptBR["texto.section.name"]), { key: "Enter" });
    const sections = latest.project?.sections ?? [];
    expect(sections.find((s) => s.id === "a")?.wordRange).toEqual([0, 3]);
    expect(sections.find((s) => s.id !== "a")?.wordRange).toEqual([4, 8]);
    // Uma só entrada no histórico: um Desfazer volta à seção original.
    act(() => latestHistory?.undo());
    expect(latest.project?.sections).toEqual([first]);
  });

  it("Shift+F10 on a focused merge dot opens the word menu under the word", () => {
    render(<Harness project={projectWith(RAW)} show />);
    const word = screen.getByTestId("word-0");
    word.getBoundingClientRect = () => ({ left: 30, bottom: 60, top: 40, right: 90, width: 60, height: 20, x: 30, y: 40, toJSON: () => ({}) });
    const dot = screen.getAllByRole("button", { name: ptBR["syllableText.merge"] })[0];
    dot.focus();
    fireEvent.keyDown(dot, { key: "F10", shiftKey: true });
    const menu = screen.getByRole("menu");
    expect(menu.style.left).toBe("30px");
    expect(menu.style.top).toBe("60px");
    expect(screen.getByRole("menuitem", { name: ptBR["texto.section.start"] })).toBeTruthy();
  });

  it("the section label opened from the keyboard shows its menu at the label", () => {
    const first: Section = { id: "a", name: "Gloria", wordRange: [0, 8] };
    render(<Harness project={{ ...projectWith(RAW), sections: [first] }} show />);
    const label = screen.getByRole("button", { name: "Gloria" });
    label.getBoundingClientRect = () => ({ left: 12, bottom: 48, top: 30, right: 80, width: 68, height: 18, x: 12, y: 30, toJSON: () => ({}) });
    fireEvent.click(label, { detail: 0 });
    const menu = screen.getByRole("menu");
    expect(menu.style.left).toBe("12px");
    expect(menu.style.top).toBe("48px");
  });

  it("hides a section whose words are out of the text", () => {
    const stale: Section = { id: "z", name: "Antiga", wordRange: [20, 25] };
    render(<Harness project={{ ...projectWith(RAW), sections: [stale] }} show />);
    expect(screen.queryByRole("button", { name: "Antiga" })).toBeNull();
  });

  it("renames and removes a section from its label", () => {
    const first: Section = { id: "a", name: "Gloria", wordRange: [0, 8] };
    render(<Harness project={{ ...projectWith(RAW), sections: [first] }} show />);
    fireEvent.contextMenu(screen.getByRole("button", { name: "Gloria" }));
    fireEvent.click(screen.getByRole("menuitem", { name: ptBR["texto.section.rename"] }));
    const input = screen.getByLabelText(ptBR["texto.section.name"]);
    fireEvent.change(input, { target: { value: "Gloria in excelsis" } });
    fireEvent.click(screen.getByRole("button", { name: ptBR["texto.section.save"] }));
    expect(latest.project?.sections[0]).toEqual({ ...first, name: "Gloria in excelsis" });

    fireEvent.contextMenu(screen.getByRole("button", { name: "Gloria in excelsis" }));
    fireEvent.click(screen.getByRole("menuitem", { name: ptBR["texto.section.remove"] }));
    expect(latest.project?.sections).toEqual([]);
  });
});
