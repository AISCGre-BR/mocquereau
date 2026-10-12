// @vitest-environment jsdom
import { afterEach, describe, it, expect, vi } from "vitest";
import { useState } from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { SuggestInput } from "./SuggestInput";

function Host({ onKey }: { onKey?: () => void }) {
  const [v, setV] = useState("");
  return <SuggestInput aria-label="cat" value={v} onChange={setV} suggestions={["Simples", "Compostos", "Ornamentais"]} onKeyDown={onKey} />;
}

describe("SuggestInput", () => {
  afterEach(cleanup);
  it("filters, navigates with arrows, picks with Enter and does not forward that Enter", () => {
    const onKey = vi.fn();
    render(<Host onKey={onKey} />);
    const input = screen.getByLabelText("cat") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "co" } });
    expect(screen.getAllByRole("option").map((o) => o.textContent)).toEqual(["Compostos"]);
    fireEvent.change(input, { target: { value: "" } });
    fireEvent.keyDown(input, { key: "ArrowDown" });
    expect(screen.getAllByRole("option")).toHaveLength(3);
    fireEvent.keyDown(input, { key: "ArrowDown" });
    expect(screen.getAllByRole("option")[1].getAttribute("aria-selected")).toBe("true");
    fireEvent.keyDown(input, { key: "Enter" });
    expect(input.value).toBe("Compostos");
    expect(screen.queryByRole("listbox")).toBeNull();
    expect(onKey).not.toHaveBeenCalled();
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onKey).toHaveBeenCalledTimes(1);
  });
  it("Esc closes only the list", () => {
    const onKey = vi.fn();
    render(<Host onKey={onKey} />);
    const input = screen.getByLabelText("cat");
    fireEvent.keyDown(input, { key: "ArrowDown" });
    expect(screen.getByRole("listbox")).toBeTruthy();
    fireEvent.keyDown(input, { key: "Escape" });
    expect(screen.queryByRole("listbox")).toBeNull();
    expect(onKey).not.toHaveBeenCalled();
    fireEvent.keyDown(input, { key: "Escape" });
    expect(onKey).toHaveBeenCalledTimes(1);
  });
  it("clicking an option picks it", () => {
    render(<Host />);
    const input = screen.getByLabelText("cat") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "s" } });
    fireEvent.click(screen.getByRole("option", { name: "Simples" }));
    expect(input.value).toBe("Simples");
  });
});
