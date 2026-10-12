// @vitest-environment jsdom
import "../../i18n";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { AnnotationPopover, placePopover } from "./AnnotationPopover";
import { ProjectContext, createNewProject, useProjectReducer } from "../../hooks/useProject";

afterEach(cleanup);

function mount() {
  const anchor = document.createElement("button");
  document.body.appendChild(anchor);
  const onClose = vi.fn();
  const onOpenInRecortes = vi.fn();
  function Harness() {
    const [state, dispatch, history] = useProjectReducer();
    return (
      <ProjectContext.Provider value={{ state: { ...state, project: createNewProject("t", "a") }, dispatch, history }}>
        <AnnotationPopover
          sourceId="s"
          syllable={0}
          syllableLabel="Pu"
          sourceName="A"
          anchor={anchor}
          onOpenInRecortes={onOpenInRecortes}
          onClose={onClose}
        />
      </ProjectContext.Provider>
    );
  }
  render(<Harness />);
  return { anchor, onClose, onOpenInRecortes };
}

describe("AnnotationPopover", () => {
  it("shows syllable and source, and the Recortes button", () => {
    const { onOpenInRecortes } = mount();
    expect(screen.getByRole("dialog")).toBeTruthy();
    expect(screen.getByText("Pu")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Abrir em Recortes" }));
    expect(onOpenInRecortes).toHaveBeenCalled();
  });

  it("Esc closes and refocuses the anchor; the anchor click is not outside", () => {
    const { anchor, onClose } = mount();
    fireEvent.pointerDown(anchor);
    expect(onClose).not.toHaveBeenCalled();
    fireEvent.keyDown(window, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(document.activeElement).toBe(anchor);
  });

  it("Esc in the comment textarea closes the popover", () => {
    const { onClose } = mount();
    const textarea = screen.getByLabelText("Observação");
    textarea.focus();
    fireEvent.keyDown(textarea, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("Esc in the Neumas input: the 1st closes the list, the 2nd closes the popover", () => {
    const { onClose } = mount();
    const input = screen.getByRole("combobox", { name: "Neumas" });
    fireEvent.focus(input);
    expect(screen.queryByRole("listbox")).toBeNull(); // focus alone does not open it
    fireEvent.keyDown(input, { key: "ArrowDown" });
    expect(screen.getByRole("listbox")).toBeTruthy();
    fireEvent.keyDown(input, { key: "Escape" });
    expect(screen.queryByRole("listbox")).toBeNull();
    expect(onClose).not.toHaveBeenCalled();
    fireEvent.keyDown(input, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("Esc in the Etiquetas input closes the popover", () => {
    const { onClose } = mount();
    const input = screen.getByLabelText("Etiquetas");
    fireEvent.keyDown(input, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("pointerdown outside blurs the focused field before closing (commit on leave)", () => {
    const { onClose } = mount();
    const input = screen.getByRole("combobox", { name: "Neumas" });
    input.focus();
    let blurredBeforeClose = false;
    onClose.mockImplementation(() => {
      blurredBeforeClose = document.activeElement !== input;
    });
    fireEvent.pointerDown(document.body);
    expect(onClose).toHaveBeenCalled();
    expect(blurredBeforeClose).toBe(true);
  });

  it("pointerdown outside closes", () => {
    const { onClose } = mount();
    fireEvent.pointerDown(document.body);
    expect(onClose).toHaveBeenCalled();
  });
});

describe("placePopover", () => {
  const viewport = { width: 1280, height: 720 };
  const cell = (top: number) => ({ left: 400, top, bottom: top + 80, width: 64 });

  it("goes below the cell when it fits, arrow on top pointing at the cell", () => {
    const p = placePopover(cell(100), 300, viewport);
    expect(p).toMatchObject({ top: 188, side: "top" });
    expect(p.left + p.arrow).toBe(432);
  });

  it("goes above the cell when only that fits, arrow at the bottom", () => {
    expect(placePopover(cell(500), 300, viewport)).toMatchObject({ top: 192, side: "bottom" });
  });

  it("stays inside the window, without arrow, when it fits neither below nor above", () => {
    const p = placePopover(cell(260), 430, viewport);
    expect(p).toMatchObject({ top: 720 - 8 - 430, side: null });
    expect(p.top + 430).toBeLessThanOrEqual(720);
  });

  it("keeps the left edge inside the window near the right border", () => {
    const p = placePopover({ left: 1250, top: 100, bottom: 180, width: 30 }, 300, viewport);
    expect(p.left).toBe(1280 - 320 - 8);
    expect(p.arrow).toBeLessThanOrEqual(320 - 16);
  });
});
