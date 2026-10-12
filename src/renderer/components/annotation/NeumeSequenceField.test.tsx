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
  onCreateKind?: (d: { name: string; categoryName: string; defaultNotes: number }) => string;
}

function setup({ initial = [], onSelect = () => {}, onCreateKind = () => "kind.new" }: Opts = {}) {
  const v = vocab();
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
  it("opens the grouped list on focus, filters and adds the first option with Enter", () => {
    const { input, kinds } = setup();
    expect(screen.queryByRole("listbox")).toBeNull();
    fireEvent.focus(input);
    expect(screen.getByRole("listbox")).toBeTruthy();
    fireEvent.change(input, { target: { value: "cl" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(kinds()).toEqual(["clivis"]);
    expect((input as HTMLInputElement).value).toBe("");
    expect(screen.getByRole("listbox")).toBeTruthy();
  });

  it("allows repetitions by clicking the same option twice", () => {
    const { input, kinds } = setup();
    fireEvent.focus(input);
    fireEvent.click(screen.getByRole("option", { name: "virga" }));
    fireEvent.click(screen.getByRole("option", { name: "virga" }));
    expect(kinds()).toEqual(["virga", "virga"]);
  });

  it("moves the active option with the arrows", () => {
    const { input, kinds } = setup();
    fireEvent.focus(input);
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
    fireEvent.focus(input);
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
    fireEvent.focus(input);
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
    fireEvent.change(category, { target: { value: "Formas raras" } });
    expect(screen.getByText("Nova categoria")).toBeTruthy();
    const submit = screen.getByRole("button", { name: "Criar" }) as HTMLButtonElement;
    expect(submit.disabled).toBe(true);
    const notes = screen.getByLabelText("Notas");
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
    expect(input.getAttribute("aria-controls")).toBe(screen.getByRole("listbox").id);
    fireEvent.change(input, { target: { value: "c" } });
    const listbox = screen.getByRole("listbox");
    expect(listbox.querySelector('[role="separator"]')).toBeNull();
    fireEvent.change(input, { target: { value: "zzz" } });
    expect(screen.getByRole("listbox").textContent).not.toContain("Nenhum neuma encontrado");
    expect(screen.getByRole("option", { name: "Criar «zzz»" }).hasAttribute("aria-expanded")).toBe(false);
  });
});
