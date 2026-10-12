// @vitest-environment jsdom
import "../../i18n";
import i18n from "../../i18n";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { useState } from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { NeumeSequenceField } from "./NeumeSequenceField";
import { createDefaultVocabulary } from "@shared/annotation/default-vocabulary";
import type { NeumeItem, NeumeVocabulary } from "@shared/annotation/types";

beforeAll(() => i18n.changeLanguage("pt-BR"));
afterEach(cleanup);

function vocab(): NeumeVocabulary {
  const v = createDefaultVocabulary(i18n.t.bind(i18n));
  return { ...v, kinds: v.kinds.map((k) => (k.id === "punctum" ? { ...k, hidden: true } : k)) };
}

interface Opts {
  initial?: NeumeItem[];
  onSelect?: (i: number | null) => void;
  onCreateKind?: (d: { name: string; categoryName?: string; defaultNotes?: number }) => string;
  vocabulary?: NeumeVocabulary;
}

function setup({ initial = [], onSelect = () => {}, onCreateKind = () => "kind.new", vocabulary }: Opts = {}) {
  const v = vocabulary ?? vocab();
  function Harness() {
    const [value, setValue] = useState<NeumeItem[]>(initial);
    const [sel, setSel] = useState<number | null>(null);
    return (
      <>
        <NeumeSequenceField
          vocabulary={v}
          value={value}
          onChange={setValue}
          selectedIndex={sel}
          onSelect={(i) => {
            onSelect(i);
            setSel(i);
          }}
          onCreateKind={onCreateKind}
        />
        <output data-testid="value">{JSON.stringify(value.map((n) => n.kind))}</output>
      </>
    );
  }
  render(<Harness />);
  const input = screen.getByRole("combobox");
  const kinds = () => JSON.parse(screen.getByTestId("value").textContent!) as string[];
  return { input, kinds };
}

describe("NeumeSequenceField", () => {
  it("does not open the list on focus; typing opens it, Enter adds the first option and closes it", () => {
    const { input, kinds } = setup();
    expect(screen.queryByRole("listbox")).toBeNull();
    fireEvent.focus(input);
    fireEvent.click(input);
    expect(screen.queryByRole("listbox")).toBeNull();
    fireEvent.change(input, { target: { value: "cl" } });
    expect(screen.getByRole("listbox")).toBeTruthy();
    fireEvent.keyDown(input, { key: "Enter" });
    expect(kinds()).toEqual(["clivis"]);
    expect((input as HTMLInputElement).value).toBe("");
    expect(screen.queryByRole("listbox")).toBeNull();
  });

  it("clearing the typed text closes the list again", () => {
    const { input } = setup();
    fireEvent.change(input, { target: { value: "p" } });
    expect(screen.getByRole("listbox")).toBeTruthy();
    fireEvent.change(input, { target: { value: "" } });
    expect(screen.queryByRole("listbox")).toBeNull();
  });

  it("ArrowDown and Alt+ArrowDown open the list; ArrowUp does not", () => {
    const { input } = setup();
    fireEvent.focus(input);
    fireEvent.keyDown(input, { key: "ArrowUp" });
    expect(screen.queryByRole("listbox")).toBeNull();
    fireEvent.keyDown(input, { key: "ArrowDown" });
    expect(screen.getByRole("listbox")).toBeTruthy();
    fireEvent.keyDown(input, { key: "Escape" });
    expect(screen.queryByRole("listbox")).toBeNull();
    fireEvent.keyDown(input, { key: "ArrowDown", altKey: true });
    expect(screen.getByRole("listbox")).toBeTruthy();
  });

  it("clicking a word selects it without opening the list, and closes an open one", () => {
    const onSelect = vi.fn();
    const { input } = setup({ initial: [{ kind: "virga" }, { kind: "pes" }], onSelect });
    fireEvent.mouseDown(screen.getByText("pes"));
    fireEvent.click(screen.getByText("pes"));
    expect(onSelect).toHaveBeenLastCalledWith(1);
    expect(document.activeElement).toBe(input);
    expect(screen.queryByRole("listbox")).toBeNull();
    fireEvent.keyDown(input, { key: "ArrowDown" });
    expect(screen.getByRole("listbox")).toBeTruthy();
    fireEvent.click(screen.getByText("virga", { selector: "[data-neume-index]" }));
    expect(onSelect).toHaveBeenLastCalledWith(0);
    expect(screen.queryByRole("listbox")).toBeNull();
  });

  it("a press on the empty area of the box focuses the input without opening the list", () => {
    const { input } = setup({ initial: [{ kind: "virga" }] });
    const box = input.parentElement!;
    expect(fireEvent.mouseDown(box)).toBe(false);
    expect(document.activeElement).toBe(input);
    expect(screen.queryByRole("listbox")).toBeNull();
  });

  it("allows repetitions by clicking the same option twice", () => {
    const { input, kinds } = setup();
    fireEvent.change(input, { target: { value: "virga" } });
    fireEvent.click(screen.getByRole("option", { name: "virga" }));
    fireEvent.change(input, { target: { value: "virga" } });
    fireEvent.click(screen.getByRole("option", { name: "virga" }));
    expect(kinds()).toEqual(["virga", "virga"]);
  });

  it("moves the active option with the arrows", () => {
    const { input, kinds } = setup();
    fireEvent.focus(input);
    fireEvent.keyDown(input, { key: "ArrowDown" }); // opens
    fireEvent.keyDown(input, { key: "ArrowDown" });
    const active = input.getAttribute("aria-activedescendant");
    expect(active).toBeTruthy();
    expect(document.getElementById(active!)?.textContent).toMatch(/^tractulus/);
    fireEvent.keyDown(input, { key: "Enter" });
    expect(kinds()).toEqual(["tractulus"]);
  });

  it("removes the last item with Backspace on an empty filter", () => {
    const { input, kinds } = setup({ initial: [{ kind: "virga" }, { kind: "pes" }] });
    fireEvent.focus(input);
    fireEvent.keyDown(input, { key: "Backspace" });
    expect(kinds()).toEqual(["virga"]);
  });

  it("selects a word, moves it with Alt+ArrowLeft and deletes it", () => {
    const onSelect = vi.fn();
    const { input, kinds } = setup({ initial: [{ kind: "virga" }, { kind: "pes" }], onSelect });
    fireEvent.click(screen.getByText("pes"));
    expect(onSelect).toHaveBeenLastCalledWith(1);
    fireEvent.keyDown(input, { key: "ArrowLeft", altKey: true });
    expect(kinds()).toEqual(["pes", "virga"]);
    expect(onSelect).toHaveBeenLastCalledWith(0);
    fireEvent.keyDown(input, { key: "Delete" });
    expect(kinds()).toEqual(["virga"]);
  });

  it("stops propagation of the keys it handles", () => {
    const onWindowKey = vi.fn();
    window.addEventListener("keydown", onWindowKey);
    try {
      const { input } = setup({ initial: [{ kind: "virga" }] });
      fireEvent.focus(input);
      fireEvent.keyDown(input, { key: "Backspace" });
      fireEvent.keyDown(input, { key: "ArrowDown" });
      expect(onWindowKey).not.toHaveBeenCalled();
    } finally {
      window.removeEventListener("keydown", onWindowKey);
    }
  });

  it("shows an unknown kind id in italics without error", () => {
    setup({ initial: [{ kind: "sumido" }] });
    const el = screen.getByText("sumido");
    expect(el.className).toMatch(/italic/);
  });

  it("does not list hidden kinds", () => {
    const { input } = setup();
    fireEvent.keyDown(input, { key: "ArrowDown" });
    expect(screen.queryByRole("option", { name: "punctum" })).toBeNull();
    expect(screen.getByRole("option", { name: "virga" })).toBeTruthy();
  });

  it("typing the exact name of a hidden kind offers it", () => {
    const { input, kinds } = setup();
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: "Punctum" } });
    const option = screen.getByRole("option", { name: "punctum" });
    expect(screen.queryByText(/Criar «/)).toBeNull();
    fireEvent.click(option);
    expect(kinds()).toEqual(["punctum"]);
  });

  it("a prefix of a hidden kind still does not list it", () => {
    const { input } = setup();
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: "punct" } });
    expect(screen.queryByRole("option", { name: "punctum" })).toBeNull();
  });

  it("Esc closes the list", () => {
    const { input } = setup();
    fireEvent.keyDown(input, { key: "ArrowDown" });
    expect(screen.getByRole("listbox")).toBeTruthy();
    fireEvent.keyDown(input, { key: "Escape" });
    expect(screen.queryByRole("listbox")).toBeNull();
  });

  it("creates a new kind inline", () => {
    const onCreateKind = vi.fn(() => "kind.new");
    const { input, kinds } = setup({ onCreateKind });
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: "clivis" } });
    expect(screen.queryByText(/Criar «/)).toBeNull();

    fireEvent.change(input, { target: { value: "climacus sub" } });
    expect(screen.getByText("Nenhum neuma encontrado")).toBeTruthy();
    const create = screen.getByRole("option", { name: "Criar «climacus sub»" });

    // Esc in the form returns to the list without creating.
    fireEvent.click(create);
    let category = screen.getByLabelText("Categoria");
    expect(document.activeElement).toBe(category);
    fireEvent.keyDown(category, { key: "Escape" });
    expect(screen.queryByLabelText("Categoria")).toBeNull();
    expect(screen.getByRole("listbox")).toBeTruthy();
    expect(onCreateKind).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("option", { name: "Criar «climacus sub»" }));
    category = screen.getByLabelText("Categoria");
    expect(screen.queryByText("Nova categoria")).toBeNull();
    fireEvent.change(category, { target: { value: "Formas raras" } });
    expect(screen.getByText("Nova categoria")).toBeTruthy();
    const submit = screen.getByRole("button", { name: "Criar" }) as HTMLButtonElement;
    expect(submit.disabled).toBe(false);
    const notes = screen.getByLabelText("Notas");
    fireEvent.change(notes, { target: { value: "0" } });
    expect(submit.disabled).toBe(true);
    fireEvent.change(notes, { target: { value: "x" } });
    expect(submit.disabled).toBe(true);
    fireEvent.change(notes, { target: { value: "5" } });
    expect(submit.disabled).toBe(false);
    fireEvent.keyDown(notes, { key: "Enter" });

    expect(onCreateKind).toHaveBeenCalledWith({ name: "climacus sub", categoryName: "Formas raras", defaultNotes: 5 });
    expect(kinds()).toEqual(["kind.new"]);
    expect((input as HTMLInputElement).value).toBe("");
  });

  it("does not show the new-category hint for an existing category", () => {
    const { input } = setup();
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: "xyz" } });
    fireEvent.click(screen.getByRole("option", { name: "Criar «xyz»" }));
    fireEvent.change(screen.getByLabelText("Categoria"), { target: { value: "compostos" } });
    expect(screen.queryByText("Nova categoria")).toBeNull();
  });

  it("appending an existing option closes the create form", () => {
    const onCreateKind = vi.fn(() => "kind.new");
    const { input, kinds } = setup({ onCreateKind });
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: "cl" } });
    fireEvent.click(screen.getByRole("option", { name: "Criar «cl»" }));
    expect(screen.getByLabelText("Categoria")).toBeTruthy();
    fireEvent.click(screen.getByRole("option", { name: "clivis" }));
    expect(kinds()).toEqual(["clivis"]);
    expect(screen.queryByLabelText("Categoria")).toBeNull();
    expect(screen.queryByRole("button", { name: "Criar" })).toBeNull();
    expect(onCreateKind).not.toHaveBeenCalled();
  });

  it("only references the list while it is open, and keeps decoration out of the listbox", () => {
    const { input } = setup();
    expect(input.getAttribute("aria-controls")).toBeNull();
    fireEvent.focus(input);
    expect(input.getAttribute("aria-controls")).toBeNull();
    fireEvent.change(input, { target: { value: "c" } });
    expect(input.getAttribute("aria-controls")).toBe(screen.getByRole("listbox").id);
    const listbox = screen.getByRole("listbox");
    expect(listbox.querySelector('[role="separator"]')).toBeNull();
    fireEvent.change(input, { target: { value: "zzz" } });
    expect(screen.getByRole("listbox").textContent).not.toContain("Nenhum neuma encontrado");
    expect(screen.getByRole("option", { name: "Criar «zzz»" }).hasAttribute("aria-expanded")).toBe(false);
  });
  it("the create form accepts neither category nor notes", () => {
    const onCreateKind = vi.fn(() => "kind.new");
    const { input, kinds } = setup({ onCreateKind });
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: "xyz" } });
    fireEvent.click(screen.getByRole("option", { name: "Criar «xyz»" }));
    fireEvent.click(screen.getByRole("button", { name: "Criar" }));
    expect(onCreateKind).toHaveBeenCalledWith({ name: "xyz" });
    expect(kinds()).toEqual(["kind.new"]);
  });

  it("leaving the field with the exact name of a kind (accents/case folded) appends it", () => {
    const onCreateKind = vi.fn(() => "kind.new");
    const { input, kinds } = setup({ onCreateKind });
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: " CLÍVIS " } });
    fireEvent.blur(input);
    expect(kinds()).toEqual(["clivis"]);
    expect(onCreateKind).not.toHaveBeenCalled();
    expect((input as HTMLInputElement).value).toBe("");
  });

  it("leaving the field with the exact name of a hidden kind appends it", () => {
    const { input, kinds } = setup();
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: "punctum" } });
    fireEvent.blur(input);
    expect(kinds()).toEqual(["punctum"]);
  });

  it("leaving the field with a new name creates the kind (name only) and appends it", () => {
    const onCreateKind = vi.fn(() => "kind.new");
    const { input, kinds } = setup({ initial: [{ kind: "virga" }], onCreateKind });
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: "  cl  " } });
    fireEvent.blur(input);
    expect(onCreateKind).toHaveBeenCalledTimes(1);
    expect(onCreateKind).toHaveBeenCalledWith({ name: "cl" });
    expect(kinds()).toEqual(["virga", "kind.new"]);
    expect((input as HTMLInputElement).value).toBe("");
  });

  it("leaving the field with blank text does nothing", () => {
    const onCreateKind = vi.fn(() => "kind.new");
    const { input, kinds } = setup({ onCreateKind });
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: "   " } });
    fireEvent.blur(input);
    expect(kinds()).toEqual([]);
    expect(onCreateKind).not.toHaveBeenCalled();
  });

  it("moving focus into the create form does not commit; leaving the form does", () => {
    const onCreateKind = vi.fn(() => "kind.new");
    const { input, kinds } = setup({ onCreateKind });
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: "xyz" } });
    fireEvent.click(screen.getByRole("option", { name: "Criar «xyz»" }));
    const category = screen.getByLabelText("Categoria");
    fireEvent.blur(input, { relatedTarget: category });
    expect(onCreateKind).not.toHaveBeenCalled();
    fireEvent.change(category, { target: { value: "Formas raras" } });
    fireEvent.blur(category, { relatedTarget: document.body });
    expect(onCreateKind).toHaveBeenCalledWith({ name: "xyz" });
    expect(kinds()).toEqual(["kind.new"]);
  });

  it("a comma commits the text typed so far and closes the list", () => {
    const onCreateKind = vi.fn(() => "kind.new");
    const { input, kinds } = setup({ onCreateKind });
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: "pes" } });
    fireEvent.keyDown(input, { key: "," });
    expect(kinds()).toEqual(["pes"]);
    expect((input as HTMLInputElement).value).toBe("");
    expect(screen.queryByRole("listbox")).toBeNull();
    fireEvent.keyDown(input, { key: "," });
    expect(kinds()).toEqual(["pes"]);
    expect(onCreateKind).not.toHaveBeenCalled();
  });

  it("pasted text with commas commits every complete name, once per new name", () => {
    let n = 0;
    const onCreateKind = vi.fn(() => `kind.${++n}`);
    const { input, kinds } = setup({ onCreateKind });
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: "virga, novo,, Novo, pe" } });
    expect(kinds()).toEqual(["virga", "kind.1", "kind.1"]);
    expect(onCreateKind).toHaveBeenCalledTimes(1);
    expect((input as HTMLInputElement).value).toBe("pe");
  });

  it("lists kinds without category in a final group and omits absent default notes", () => {
    const v = vocab();
    v.kinds.push({ id: "solto", name: "pes solto" });
    const { input } = setup({ vocabulary: v });
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: "pes" } });
    const groups = screen.getAllByRole("group");
    const last = groups[groups.length - 1];
    expect(last.getAttribute("aria-labelledby")).toBeTruthy();
    expect(document.getElementById(last.getAttribute("aria-labelledby")!)!.textContent).toBe("Sem categoria");
    const option = screen.getByRole("option", { name: "pes solto" });
    expect(option.textContent).toBe("pes solto");
    expect(screen.getByRole("option", { name: "pes" }).textContent).toBe("pes2");
  });
});

describe("NeumeSequenceField: leaving vs. not leaving", () => {
  it("a press on a non-focusable part of the list keeps the focus (no commit, no junk kind)", () => {
    const onCreateKind = vi.fn(() => "kind.new");
    const { input, kinds } = setup({ onCreateKind });
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: "cl" } });
    const header = screen.getAllByRole("group")[0].firstElementChild as HTMLElement;
    expect(fireEvent.mouseDown(header)).toBe(false); // default prevented: focus stays in the input
    const listbox = screen.getByRole("listbox");
    expect(fireEvent.mouseDown(listbox.parentElement!)).toBe(false);
    fireEvent.click(screen.getByRole("option", { name: "Criar «cl»" }));
    const category = screen.getByLabelText("Categoria");
    expect(fireEvent.mouseDown(category.parentElement!)).toBe(false);
    expect(fireEvent.mouseDown(category)).toBe(true); // inputs of the form still take the focus
    expect(onCreateKind).not.toHaveBeenCalled();
    expect(kinds()).toEqual([]);
  });

  it("the window losing focus does not commit; the text stays", () => {
    const onCreateKind = vi.fn(() => "kind.new");
    const { input, kinds } = setup({ onCreateKind });
    input.focus(); // stays the active element while the window is away
    fireEvent.change(input, { target: { value: "cl" } });
    const spy = vi.spyOn(document, "hasFocus").mockReturnValue(false);
    try {
      fireEvent.blur(input);
    } finally {
      spy.mockRestore();
    }
    expect(onCreateKind).not.toHaveBeenCalled();
    expect(kinds()).toEqual([]);
    expect((input as HTMLInputElement).value).toBe("cl");
    fireEvent.blur(input);
    expect(onCreateKind).toHaveBeenCalledWith({ name: "cl" });
  });

  it("Enter with the list closed (after Esc) commits the typed text", () => {
    const { input, kinds } = setup();
    fireEvent.change(input, { target: { value: "clivis" } });
    fireEvent.keyDown(input, { key: "Escape" });
    expect(screen.queryByRole("listbox")).toBeNull();
    fireEvent.keyDown(input, { key: "Enter" });
    expect(kinds()).toEqual(["clivis"]);
    expect((input as HTMLInputElement).value).toBe("");
    expect(screen.queryByRole("listbox")).toBeNull();
  });

  it("Esc with the list closed cancels the pending text (no commit)", () => {
    const onCreateKind = vi.fn(() => "kind.new");
    const { input, kinds } = setup({ onCreateKind });
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: "punctum" } });
    fireEvent.keyDown(input, { key: "Escape" }); // closes the list, keeps the text
    expect((input as HTMLInputElement).value).toBe("punctum");
    fireEvent.keyDown(input, { key: "Escape" }); // cancels and leaves
    fireEvent.blur(input);
    expect((input as HTMLInputElement).value).toBe("");
    expect(kinds()).toEqual([]);
    expect(onCreateKind).not.toHaveBeenCalled();
  });
});
