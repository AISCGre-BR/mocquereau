// @vitest-environment jsdom
import "../../i18n";
import { afterEach, describe, it, expect, vi } from "vitest";
import { cleanup, render, screen, fireEvent } from "@testing-library/react";
import { SyllableText } from "./SyllableText";

const words = [
  { original: "Glória", syllables: ["Gló", "ri", "a"] },
  { original: "in", syllables: ["in"] },
];

afterEach(cleanup);

describe("SyllableText", () => {
  it("renders lines and merges on dot click", () => {
    const onChange = vi.fn();
    render(<SyllableText raw="Glória in" words={words} onWordsChange={onChange} />);
    fireEvent.click(screen.getAllByRole("button", { name: "Unir sílabas" })[0]);
    expect(onChange).toHaveBeenCalledWith([{ original: "Glória", syllables: ["Glóri", "a"] }, words[1]], 0);
  });

  it("splits between two letters", () => {
    const onChange = vi.fn();
    render(<SyllableText raw="Glória in" words={words} onWordsChange={onChange} />);
    fireEvent.click(screen.getAllByText("i", { selector: "[data-char-index]" })[0], { clientX: 0 });
    expect(onChange).toHaveBeenCalledWith(
      [{ original: "Glória", syllables: ["Gló", "r", "i", "a"] }, words[1]],
      0,
    );
  });

  it("ignores clicks on syllable edges", () => {
    const onChange = vi.fn();
    render(<SyllableText raw="Glória in" words={words} onWordsChange={onChange} />);
    fireEvent.click(screen.getByText("G", { selector: "[data-char-index]" }), { clientX: 0 });
    expect(onChange).not.toHaveBeenCalled();
  });

  it("offers the alternative division of an ambiguous word", async () => {
    const w = [{ original: "propter", syllables: ["pro", "pter"] }];
    const onChange = vi.fn();
    render(
      <SyllableText
        raw="propter"
        words={w}
        onWordsChange={onChange}
        ambiguities={new Map([[0, { sung: ["pro", "pter"], typographic: ["prop", "ter"] }]])}
      />,
    );
    fireEvent.click(screen.getByTestId("word-0"));
    fireEvent.click(await screen.findByRole("menuitem", { name: /prop·ter/ }));
    expect(onChange).toHaveBeenCalledWith([{ original: "propter", syllables: ["prop", "ter"] }], 0);
  });

  it("opens the alternatives from the keyboard", async () => {
    const w = [{ original: "propter", syllables: ["pro", "pter"] }];
    const onChange = vi.fn();
    render(
      <SyllableText
        raw="propter"
        words={w}
        onWordsChange={onChange}
        ambiguities={new Map([[0, { sung: ["pro", "pter"], typographic: ["prop", "ter"] }]])}
      />,
    );
    const word = screen.getByTestId("word-0");
    word.focus();
    fireEvent.keyDown(word, { key: "Enter" });
    const current = await screen.findByRole("menuitem", { name: /pro·pter/ });
    expect(document.activeElement).toBe(current);
    fireEvent.keyDown(current, { key: "ArrowDown" });
    fireEvent.keyDown(document.activeElement as Element, { key: "Enter" });
    expect(onChange).toHaveBeenCalledWith([{ original: "propter", syllables: ["prop", "ter"] }], 0);
  });

  it("closes with Escape and returns focus to the word", async () => {
    const w = [{ original: "propter", syllables: ["pro", "pter"] }];
    render(
      <SyllableText
        raw="propter"
        words={w}
        onWordsChange={vi.fn()}
        ambiguities={new Map([[0, { sung: ["pro", "pter"], typographic: ["prop", "ter"] }]])}
      />,
    );
    const word = screen.getByTestId("word-0");
    fireEvent.keyDown(word, { key: "ArrowDown" });
    fireEvent.keyDown(await screen.findByRole("menuitem", { name: /pro·pter/ }), { key: "Escape" });
    expect(screen.queryByRole("menu")).toBeNull();
    expect(document.activeElement).toBe(word);
  });

  it("a double click on a letter does not split a second time", () => {
    const onChange = vi.fn();
    render(<SyllableText raw="Glória in" words={words} onWordsChange={onChange} />);
    const i = screen.getAllByText("i", { selector: "[data-char-index]" })[0];
    fireEvent.click(i, { clientX: 0, detail: 1 });
    fireEvent.click(i, { clientX: 0, detail: 2 });
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it("marks the current division in the alternatives menu", async () => {
    const w = [{ original: "propter", syllables: ["pro", "pter"] }];
    render(
      <SyllableText
        raw="propter"
        words={w}
        onWordsChange={vi.fn()}
        ambiguities={new Map([[0, { sung: ["pro", "pter"], typographic: ["prop", "ter"] }]])}
      />,
    );
    fireEvent.click(screen.getByTestId("word-0"));
    expect((await screen.findByRole("menuitem", { name: /pro·pter/ })).getAttribute("aria-current")).toBe("true");
    expect(screen.getByRole("menuitem", { name: /prop·ter/ }).getAttribute("aria-current")).toBeNull();
  });

  it("clicking a word without alternatives opens nothing", () => {
    render(<SyllableText raw="Glória in" words={words} onWordsChange={vi.fn()} />);
    fireEvent.click(screen.getByTestId("word-1"));
    expect(screen.queryByRole("menu")).toBeNull();
    expect(screen.getByTestId("word-1").getAttribute("role")).toBeNull();
  });

  it("ignores an ambiguity whose letters do not match the word (older manual edits)", () => {
    const w = [{ original: "Deo", syllables: ["De", "o"] }];
    render(
      <SyllableText
        raw="propter"
        words={w}
        onWordsChange={vi.fn()}
        ambiguities={new Map([[0, { sung: ["pro", "pter"], typographic: ["prop", "ter"] }]])}
      />,
    );
    fireEvent.click(screen.getByTestId("word-0"));
    expect(screen.queryByRole("menu")).toBeNull();
    expect(screen.getByTestId("word-0").getAttribute("role")).toBeNull();
  });

  it("merge dots are one tab stop, navigated with the arrow keys", () => {
    const w = [
      { original: "Glória", syllables: ["Gló", "ri", "a"] },
      { original: "Deo", syllables: ["De", "o"] },
    ];
    render(<SyllableText raw="Glória Deo" words={w} onWordsChange={vi.fn()} />);
    const dots = screen.getAllByRole("button", { name: "Unir sílabas" });
    expect(dots.map((d) => d.tabIndex)).toEqual([0, -1, -1]);
    dots[0].focus();
    fireEvent.keyDown(dots[0], { key: "ArrowRight" });
    expect(document.activeElement).toBe(dots[1]);
    fireEvent.keyDown(dots[1], { key: "ArrowRight" });
    expect(document.activeElement).toBe(dots[2]);
    expect(dots.map((d) => d.tabIndex)).toEqual([-1, -1, 0]);
    fireEvent.keyDown(dots[2], { key: "ArrowLeft" });
    expect(document.activeElement).toBe(dots[1]);
  });

  it("Shift+F10 or the context-menu key on a focused dot opens the menu of its word", () => {
    const onMenu = vi.fn();
    const w = [
      { original: "Glória", syllables: ["Gló", "ri", "a"] },
      { original: "Deo", syllables: ["De", "o"] },
    ];
    render(<SyllableText raw="Glória Deo" words={w} onWordsChange={vi.fn()} onWordContextMenu={onMenu} />);
    const dots = screen.getAllByRole("button", { name: "Unir sílabas" });
    fireEvent.keyDown(dots[2], { key: "F10", shiftKey: true });
    expect(onMenu).toHaveBeenLastCalledWith(1, { x: 0, y: 0 });
    fireEvent.keyDown(dots[0], { key: "ContextMenu" });
    expect(onMenu).toHaveBeenLastCalledWith(0, { x: 0, y: 0 });
  });

  it("a right click on a word opens its menu at the pointer", () => {
    const onMenu = vi.fn();
    render(<SyllableText raw="Glória in" words={words} onWordsChange={vi.fn()} onWordContextMenu={onMenu} />);
    fireEvent.contextMenu(screen.getByTestId("word-1"), { clientX: 40, clientY: 50 });
    expect(onMenu).toHaveBeenCalledWith(1, { x: 40, y: 50 });
  });
});
