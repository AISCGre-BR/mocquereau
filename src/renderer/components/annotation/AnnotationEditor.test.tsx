// @vitest-environment jsdom
import "../../i18n";
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { AnnotationEditor } from "./AnnotationEditor";
import {
  ProjectContext,
  createNewProject,
  useProjectReducer,
  type DocumentAction,
  type HistoryApi,
  type ProjectState,
} from "../../hooks/useProject";
import type { MocquereauProject } from "../../lib/models";

function mkProject(): MocquereauProject {
  const p = createNewProject("t", "a");
  const src = (id: string) => ({
    id,
    order: 1,
    metadata: { siglum: id.toUpperCase(), library: "", city: "", century: "", classes: [null, null, null] as [null, null, null] },
    lines: [],
    syllableCuts: {},
  });
  return { ...p, sources: [src("s1"), src("s2")], tags: [{ id: "t-rasp", name: "raspagem" }] } as MocquereauProject;
}

function mount(variant: "full" | "compact" = "full", onNext = vi.fn()) {
  const ref: { state?: ProjectState; dispatch?: React.Dispatch<DocumentAction>; history?: HistoryApi } = {};
  function Harness() {
    const [state, dispatch, history] = useProjectReducer();
    Object.assign(ref, { state, dispatch, history });
    if (!state.project) return null;
    return (
      <ProjectContext.Provider value={{ state, dispatch, history }}>
        <AnnotationEditor target={{ sourceId: "s1", syllable: 0 }} variant={variant} onNext={onNext} />
      </ProjectContext.Provider>
    );
  }
  render(<Harness />);
  act(() => ref.dispatch!({ type: "SET_PROJECT", payload: mkProject() }));
  const ann = () => ref.state!.project!.sources[0].annotations?.[0];
  return { ref, ann, onNext };
}

function addNeume(name: string) {
  const box = screen.getByRole("combobox", { name: "Neumas" });
  fireEvent.focus(box);
  fireEvent.change(box, { target: { value: name } });
  fireEvent.click(screen.getByRole("option", { name }));
}

const pressed = () => document.querySelectorAll('[aria-pressed="true"]');
const total = () => screen.getByLabelText("Total de notas");

afterEach(cleanup);

describe("AnnotationEditor", () => {
  it("starts with nothing selected and an undefined total", () => {
    mount();
    expect(pressed()).toHaveLength(0);
    const input = total() as HTMLInputElement;
    expect(input.value).toBe("");
    expect(input.placeholder).toBe("—");
  });

  it("totals notes, overrides per neume and clears the override", () => {
    const { ann } = mount();
    addNeume("pes");
    addNeume("clivis");
    expect(total().textContent).toBe("4");
    fireEvent.click(document.querySelector('[data-neume-index="0"]')!);
    expect(pressed()).toHaveLength(0);
    const notes = screen.getByLabelText("Notas") as HTMLInputElement;
    expect(notes.placeholder).toBe("2");
    fireEvent.change(notes, { target: { value: "3" } });
    expect(total().textContent).toBe("5");
    expect(ann()!.neumes[0].notes).toBe(3);
    fireEvent.change(notes, { target: { value: "" } });
    expect(total().textContent).toBe("4");
    expect(ann()!.neumes[0]).not.toHaveProperty("notes");
  });

  it("edits the total directly while the list is empty", () => {
    const { ann } = mount();
    fireEvent.change(total(), { target: { value: "7" } });
    expect(ann()!.notes).toBe(7);
    fireEvent.change(total(), { target: { value: "" } });
    expect(ann()).toBeUndefined();
  });

  it("clicking the selected certainty clears it", () => {
    const { ann } = mount();
    const probable = screen.getByRole("button", { name: "Provável" });
    fireEvent.click(probable);
    expect(ann()!.certainty).toBe("probable");
    fireEvent.click(probable);
    expect(ann()).toBeUndefined();
  });

  it("sets liquescence and episema on the selected neume", () => {
    const { ann } = mount();
    addNeume("pes");
    fireEvent.click(document.querySelector('[data-neume-index="0"]')!);
    fireEvent.click(screen.getByRole("button", { name: "Dimin." }));
    fireEvent.click(screen.getByRole("button", { name: "Não" }));
    expect(ann()!.neumes[0]).toMatchObject({ liquescence: "diminutive", episema: false });
  });

  it("resolves letters by abbreviation and flags unknown ones", () => {
    const { ann } = mount();
    addNeume("pes");
    fireEvent.click(document.querySelector('[data-neume-index="0"]')!);
    const letters = screen.getByLabelText("Letras");
    fireEvent.change(letters, { target: { value: "c x" } });
    expect(ann()!.neumes[0].letters).toEqual(["letter.c", "letter.x"]);
    expect(letters.getAttribute("aria-invalid")).toBeNull();
    fireEvent.change(letters, { target: { value: "c, x q" } });
    expect(letters.getAttribute("aria-invalid")).toBe("true");
    expect(ann()!.neumes[0].letters).toEqual(["letter.c", "letter.x"]);
  });

  it("Enter in Etiquetas applies existing tags and creates new ones", () => {
    const { ref, ann } = mount();
    const tags = screen.getByRole("combobox", { name: "Etiquetas" });
    fireEvent.focus(tags);
    fireEvent.change(tags, { target: { value: "raspagem; nova" } });
    fireEvent.keyDown(tags, { key: "Enter" });
    const nova = ref.state!.project!.tags!.find((t) => t.name === "nova");
    expect(nova).toBeDefined();
    expect(ann()!.tags).toEqual(["t-rasp", nova!.id]);
  });

  it("suggests existing tags by prefix", () => {
    mount();
    const tags = screen.getByRole("combobox", { name: "Etiquetas" });
    fireEvent.focus(tags);
    fireEvent.change(tags, { target: { value: "ras" } });
    fireEvent.click(screen.getByRole("option", { name: "raspagem" }));
    expect((tags as HTMLInputElement).value).toBe("raspagem; ");
  });

  it("does not dispatch when a field blurs unchanged", () => {
    const { ref } = mount();
    const tags = screen.getByRole("combobox", { name: "Etiquetas" });
    fireEvent.focus(tags);
    fireEvent.blur(tags);
    const comment = screen.getByLabelText("Observação");
    fireEvent.focus(comment);
    fireEvent.blur(comment);
    expect(ref.state!.isDirty).toBe(false);
  });

  it("blur applies a trailing hashtag in the comment", () => {
    const { ref, ann } = mount();
    const comment = screen.getByLabelText("Observação");
    fireEvent.change(comment, { target: { value: "ver #raspagem" } });
    expect(ann()!.tags).toEqual([]);
    fireEvent.blur(comment);
    expect(ann()!.tags).toEqual(["t-rasp"]);
    expect(ref.state!.project!.sources[0].annotations![0].comment).toBe("ver #raspagem");
  });

  it("compact variant hides the per-neume detail", () => {
    mount("compact");
    addNeume("pes");
    fireEvent.click(document.querySelector('[data-neume-index="0"]')!);
    expect(screen.queryByLabelText("Notas")).toBeNull();
    expect(screen.queryByRole("toolbar", { name: "Liquescência" })).toBeNull();
    expect(screen.queryByRole("toolbar", { name: "Episema" })).toBeNull();
    expect(screen.queryByLabelText("Letras")).toBeNull();
    expect(screen.getByRole("toolbar", { name: "Certeza da leitura" })).toBeTruthy();
  });

  it("Ctrl+Enter calls onNext", () => {
    const { onNext } = mount();
    fireEvent.keyDown(screen.getByLabelText("Observação"), { key: "Enter", ctrlKey: true });
    fireEvent.keyDown(screen.getByRole("combobox", { name: "Neumas" }), { key: "Enter", ctrlKey: true });
    expect(onNext).toHaveBeenCalledTimes(2);
  });
});

/** Editor keyed by target (as in the Recortes panel), with Ctrl+Enter advancing and a way to close it. */
function mountKeyed() {
  const ref: {
    state?: ProjectState;
    dispatch?: React.Dispatch<DocumentAction>;
    close?: () => void;
  } = {};
  function Harness() {
    const [state, dispatch, history] = useProjectReducer();
    const [syllable, setSyllable] = useState(0);
    const [open, setOpen] = useState(true);
    Object.assign(ref, { state, dispatch, close: () => setOpen(false) });
    if (!state.project) return null;
    return (
      <ProjectContext.Provider value={{ state, dispatch, history }}>
        {open && (
          <AnnotationEditor
            key={syllable}
            target={{ sourceId: "s1", syllable }}
            variant="full"
            onNext={() => setSyllable((n) => n + 1)}
          />
        )}
      </ProjectContext.Provider>
    );
  }
  render(<Harness />);
  act(() => ref.dispatch!({ type: "SET_PROJECT", payload: mkProject() }));
  const ann = (i: number) => ref.state!.project!.sources[0].annotations?.[i];
  return { ref, ann };
}

function typePending(text: string) {
  const box = screen.getByRole("combobox", { name: "Neumas" }) as HTMLInputElement;
  act(() => box.focus());
  fireEvent.change(box, { target: { value: text } });
  return box;
}

describe("AnnotationEditor: pending Neumas text when leaving", () => {
  it("Ctrl+Enter commits the pending text to the original syllable", () => {
    const { ann } = mountKeyed();
    const box = typePending("punctum");
    fireEvent.keyDown(box, { key: "Enter", ctrlKey: true });
    expect(ann(0)?.neumes).toEqual([{ kind: "punctum" }]);
    expect(ann(1)).toBeUndefined();
  });

  it("closing (unmounting) the editor commits the pending text", () => {
    const { ref, ann } = mountKeyed();
    typePending("punctum");
    act(() => ref.close!());
    expect(ann(0)?.neumes).toEqual([{ kind: "punctum" }]);
  });
});
