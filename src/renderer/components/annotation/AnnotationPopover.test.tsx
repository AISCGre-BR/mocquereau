// @vitest-environment jsdom
import "../../i18n";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { AnnotationPopover } from "./AnnotationPopover";
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

  it("pointerdown outside closes", () => {
    const { onClose } = mount();
    fireEvent.pointerDown(document.body);
    expect(onClose).toHaveBeenCalled();
  });
});
