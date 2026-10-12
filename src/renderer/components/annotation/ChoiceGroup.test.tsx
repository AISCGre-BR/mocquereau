// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { ChoiceGroup } from "./ChoiceGroup";

type C = "secure" | "probable";
const options: Array<{ value: C; label: string }> = [
  { value: "secure", label: "Seguro" },
  { value: "probable", label: "Provável" },
];

afterEach(cleanup);

describe("ChoiceGroup", () => {
  it("starts with nothing pressed", () => {
    render(<ChoiceGroup label="Certeza" options={options} value={undefined} onChange={vi.fn()} />);
    expect(document.querySelector('[aria-pressed="true"]')).toBeNull();
  });

  it("selects an option on click", () => {
    const onChange = vi.fn();
    render(<ChoiceGroup label="Certeza" options={options} value={undefined} onChange={onChange} />);
    fireEvent.click(screen.getByRole("button", { name: "Provável" }));
    expect(onChange).toHaveBeenCalledWith("probable");
  });

  it("clears when the selected option is clicked again", () => {
    const onChange = vi.fn();
    render(<ChoiceGroup label="Certeza" options={options} value="probable" onChange={onChange} />);
    expect(screen.getByRole("button", { name: "Provável" }).getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(screen.getByRole("button", { name: "Provável" }));
    expect(onChange).toHaveBeenCalledWith(undefined);
  });
});
