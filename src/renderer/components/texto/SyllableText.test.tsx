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
});
