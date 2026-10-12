// @vitest-environment jsdom
import "../i18n";
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { ExportDialog } from "./ExportDialog";
import { ProjectContext, createNewProject, initialStateForTest } from "../hooks/useProject";
import type { MocquereauProject } from "../lib/models";
import { makeAnalysisProject } from "../../shared/analysis/__fixtures__/analysis-project";

// Exportação que nunca termina: os botões ficam desabilitados (isWorking).
const collectMock = vi.hoisted(() => vi.fn());
vi.mock("../lib/docx-collect", () => ({ collectDocxCrops: collectMock }));
collectMock.mockImplementation(() => new Promise(() => undefined));

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

describe("ExportDialog: anexo de indicadores", () => {
  const withPrefs = (includeIndicators?: boolean) => ({
    ...initialStateForTest,
    project: { ...exportable(), ...(includeIndicators === undefined ? {} : { exportPrefs: { includeIndicators } }) },
  });
  const renderDialog = (state: ReturnType<typeof withPrefs>, dispatch = vi.fn()) =>
    render(
      <ProjectContext.Provider value={{ state, dispatch }}>
        <ExportDialog open onClose={vi.fn()} />
      </ProjectContext.Provider>,
    );

  it("a caixa vem desmarcada e marcar despacha SET_EXPORT_PREFS", () => {
    const dispatch = vi.fn();
    renderDialog(withPrefs(), dispatch);
    const box = screen.getByRole("checkbox", { name: "Incluir indicadores" }) as HTMLInputElement;
    expect(box.checked).toBe(false);
    fireEvent.click(box);
    expect(dispatch).toHaveBeenCalledWith({ type: "SET_EXPORT_PREFS", payload: { includeIndicators: true } });
  });

  it.each([
    [true, true],
    [false, false],
  ])("com a preferência %s, exportDocx recebe indicators: %s", async (pref, expected) => {
    const exportDocx = vi.fn(async () => null);
    (window as unknown as { mocquereau: unknown }).mocquereau = { exportDocx };
    collectMock.mockResolvedValueOnce({ title: "Puer", rows: [], syllables: [] });
    renderDialog(withPrefs(pref));
    expect((screen.getByRole("checkbox") as HTMLInputElement).checked).toBe(pref);
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Exportar DOCX" }));
    });
    expect(exportDocx).toHaveBeenCalledOnce();
    const payload = (exportDocx.mock.calls[0] as unknown[])[0] as { indicators?: { tables: unknown[] } };
    expect(payload.indicators !== undefined).toBe(expected);
    if (expected) expect(payload.indicators!.tables).toHaveLength(5);
  });

  it("os números dos indicadores seguem o idioma do app (pt-BR: 66,7%)", async () => {
    const exportDocx = vi.fn(async () => null);
    (window as unknown as { mocquereau: unknown }).mocquereau = { exportDocx };
    collectMock.mockResolvedValueOnce({ title: "A", rows: [], syllables: [] });
    const project = { ...(makeAnalysisProject() as unknown as MocquereauProject), exportPrefs: { includeIndicators: true } };
    renderDialog({ ...initialStateForTest, project });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Exportar DOCX" }));
    });
    const payload = (exportDocx.mock.calls[0] as unknown[])[0] as { indicators: { tables: Array<{ rows: Array<{ values: string[] }> }> } };
    expect(payload.indicators.tables[3].rows[0].values[1]).toBe("66,7%");
  });
});
