// @vitest-environment jsdom
import "../i18n";
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { ExportDialog } from "./ExportDialog";
import { ProjectContext, createNewProject, initialStateForTest } from "../hooks/useProject";
import type { MocquereauProject } from "../lib/models";

// Exportação que nunca termina: os botões ficam desabilitados (isWorking).
vi.mock("../lib/docx-collect", () => ({ collectDocxCrops: () => new Promise(() => undefined) }));

afterEach(cleanup);

function exportable(): MocquereauProject {
  const base = createNewProject("Puer", "");
  return {
    ...base,
    sources: [
      {
        id: "s",
        order: 1,
        metadata: { siglum: "A", library: "", city: "", century: "", classes: [null, null, null] },
        lines: [
          {
            id: "l",
            image: { dataUrl: "data:image/png;base64,", width: 10, height: 10, mimeType: "image/png" },
            syllableRange: { start: 0, end: 0 },
            dividers: [],
            gaps: [],
            confirmed: false,
          },
        ],
        syllableCuts: {},
      },
    ],
  };
}

describe("ExportDialog: teclado preso no diálogo", () => {
  it("exportando (botões desabilitados), Delete e Ctrl+N não chegam aos atalhos globais", async () => {
    const global = vi.fn();
    window.addEventListener("keydown", global);
    const state = { ...initialStateForTest, project: exportable() };
    render(
      <ProjectContext.Provider value={{ state, dispatch: vi.fn() }}>
        <ExportDialog open onClose={vi.fn()} />
      </ProjectContext.Provider>,
    );
    const exportButton = screen.getByRole("button", { name: "Exportar DOCX" });
    expect(document.activeElement).toBe(exportButton);
    await act(async () => {
      fireEvent.click(exportButton);
    });
    expect((exportButton as HTMLButtonElement).disabled).toBe(true);
    // O botão focado ficou desabilitado: o foco volta ao painel.
    await act(async () => {
      await Promise.resolve();
    });
    expect(document.activeElement).toBe(screen.getByRole("dialog"));

    // Mesmo com o foco perdido para o body, as teclas não escapam.
    (document.activeElement as HTMLElement).blur();
    fireEvent.keyDown(document.body, { key: "Delete" });
    fireEvent.keyDown(document.body, { key: "n", ctrlKey: true });
    expect(global).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(screen.getByRole("dialog"));
    window.removeEventListener("keydown", global);
  });
});
