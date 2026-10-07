// @vitest-environment jsdom
import "./i18n";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { App } from "./App";
import { createNewProject } from "./hooks/useProject";
import { SUGGESTED_CLASSIFICATION, cloneClassification } from "../shared/classification";
import { syllabifyText } from "./lib/syllabify";
import type { ManuscriptSource, MocquereauAPI, MocquereauProject } from "./lib/models";

function projectWithBox(): MocquereauProject {
  const base = createNewProject("Introito", "");
  const raw = "Puer natus est";
  const source: ManuscriptSource = {
    id: "src-1",
    order: 0,
    metadata: { siglum: "A", library: "", city: "", century: "", classes: [null, null, null] },
    lines: [
      {
        id: "line-1",
        image: { dataUrl: "data:image/png;base64,iVBORw0KGgo=", width: 100, height: 50, mimeType: "image/png" },
        syllableRange: { start: 0, end: 3 },
        dividers: [],
        gaps: [],
        syllableBoxes: { 0: { x: 0.1, y: 0.1, w: 0.2, h: 0.5 } },
        confirmed: true,
      },
    ],
    syllableCuts: {},
  };
  return { ...base, text: { raw, words: syllabifyText(raw, "sung"), hyphenationMode: "sung" }, sources: [source] };
}

beforeEach(() => {
  window.mocquereau = {
    platform: "linux",
    getTheme: vi.fn().mockResolvedValue("system"),
    setTheme: vi.fn().mockResolvedValue(true),
    getClassification: vi.fn().mockResolvedValue(cloneClassification(SUGGESTED_CLASSIFICATION)),
    setClassification: vi.fn().mockResolvedValue(undefined),
    getLanguage: vi.fn().mockResolvedValue("pt-BR"),
    setLanguage: vi.fn().mockResolvedValue("pt-BR"),
    getRecent: vi.fn().mockResolvedValue([]),
    clearRecentFiles: vi.fn().mockResolvedValue(undefined),
    addRecentFile: vi.fn().mockResolvedValue(undefined),
    getAppVersion: vi.fn().mockResolvedValue("0.0.7-alpha"),
    setDirty: vi.fn().mockResolvedValue(undefined),
    openProject: vi.fn().mockResolvedValue(null),
    openProjectByPath: vi.fn().mockResolvedValue(null),
    saveProject: vi.fn().mockResolvedValue(null),
    importGueranger: vi.fn().mockResolvedValue(null),
    openExternal: vi.fn().mockResolvedValue(undefined),
  } as unknown as MocquereauAPI;
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  document.documentElement.removeAttribute("data-theme");
});

const wait = (ms: number) => act(() => new Promise<void>((resolve) => setTimeout(resolve, ms)));
const ctrl = (key: string) => fireEvent.keyDown(window, { key, ctrlKey: true });
const tab = (name: string) => screen.getByRole("tab", { name });

describe("App", () => {
  it("abre na Welcome, sem toolbar; Ctrl+2 sem projeto não faz nada", async () => {
    render(<App />);
    expect(await screen.findByRole("button", { name: "Novo projeto" })).toBeTruthy();
    expect(screen.queryByRole("tablist")).toBeNull();
    ctrl("2");
    expect(screen.queryByRole("tablist")).toBeNull();
    expect(screen.getByText("Mocquereau", { selector: ".sc-menubar__title span" })).toBeTruthy();
  });

  it("Novo projeto leva ao Texto; Ctrl+2 e Ctrl+4 trocam de vista; não há Avançar/Voltar", async () => {
    render(<App />);
    fireEvent.click(await screen.findByRole("button", { name: "Novo projeto" }));
    await screen.findByPlaceholderText("Ex.: Sanctus XVII");
    expect(tab("Texto").getAttribute("aria-selected")).toBe("true");
    ctrl("2");
    expect(tab("Fontes").getAttribute("aria-selected")).toBe("true");
    ctrl("4");
    expect(tab("Tabela").getAttribute("aria-selected")).toBe("true");
    expect((screen.getByRole("button", { name: /Exportar DOCX/ }) as HTMLButtonElement).disabled).toBe(true);
    for (const label of [/Próximo/, /Anterior/]) {
      expect(screen.queryByRole("button", { name: label })).toBeNull();
    }
  });

  it("criar projeto e só trocar de vista não marca '— Editado'", async () => {
    render(<App />);
    fireEvent.click(await screen.findByRole("button", { name: "Novo projeto" }));
    await screen.findByPlaceholderText("Ex.: Sanctus XVII");
    await wait(350);
    ctrl("4");
    ctrl("1");
    await wait(350);
    expect(screen.queryByText("— Editado")).toBeNull();
  });

  it("Exibir > Vigília aplica o tema escuro e persiste", async () => {
    render(<App />);
    fireEvent.click(screen.getByRole("menuitem", { name: "Exibir" }));
    fireEvent.click(screen.getByRole("menuitemcheckbox", { name: /Vigília/ }));
    expect(document.documentElement.getAttribute("data-theme")).toBe("dark");
    expect(window.mocquereau.setTheme).toHaveBeenCalledWith("dark");
  });

  it("Ctrl+O abre outro projeto e remonta as vistas no Texto com o novo conteúdo", async () => {
    window.mocquereau.openProject = vi
      .fn()
      .mockResolvedValue({ project: createNewProject("Sanctus VIII", "Solesmes"), filePath: "/p/sanctus.mocquereau.json" });
    render(<App />);
    fireEvent.click(await screen.findByRole("button", { name: "Novo projeto" }));
    await screen.findByPlaceholderText("Ex.: Sanctus XVII");
    ctrl("4");
    ctrl("o");
    expect(await screen.findByDisplayValue("Sanctus VIII")).toBeTruthy();
    expect(tab("Texto").getAttribute("aria-selected")).toBe("true");
  });

  it("Editar > Desfazer (Ctrl+Z fora de campos) volta o título; dentro do campo o Ctrl+Z é do campo", async () => {
    render(<App />);
    fireEvent.click(await screen.findByRole("button", { name: "Novo projeto" }));
    await screen.findByPlaceholderText("Ex.: Sanctus XVII");
    const titleInput = screen.getByPlaceholderText("Ex.: Sanctus XVII") as HTMLInputElement;
    fireEvent.change(titleInput, { target: { value: "Puer natus est" } });
    await wait(350);
    expect(screen.getByText("— Editado")).toBeTruthy();
    // Dentro do campo: o app não intercepta.
    fireEvent.keyDown(titleInput, { key: "z", ctrlKey: true });
    expect((screen.getByPlaceholderText("Ex.: Sanctus XVII") as HTMLInputElement).value).toBe("Puer natus est");
    ctrl("z");
    expect((screen.getByPlaceholderText("Ex.: Sanctus XVII") as HTMLInputElement).value).toBe("Sem título");
    expect(screen.queryByText("— Editado")).toBeNull();
    fireEvent.keyDown(window, { key: "y", ctrlKey: true });
    expect((screen.getByPlaceholderText("Ex.: Sanctus XVII") as HTMLInputElement).value).toBe("Puer natus est");
  });

  it("título digitado e Ctrl+N antes de 300 ms: pergunta antes de descartar; Cancelar mantém o título", async () => {
    render(<App />);
    fireEvent.click(await screen.findByRole("button", { name: "Novo projeto" }));
    await screen.findByPlaceholderText("Ex.: Sanctus XVII");
    await wait(350);
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    fireEvent.change(screen.getByPlaceholderText("Ex.: Sanctus XVII"), { target: { value: "Puer natus est" } });
    ctrl("n");
    expect(confirm).toHaveBeenCalledOnce();
    expect((screen.getByPlaceholderText("Ex.: Sanctus XVII") as HTMLInputElement).value).toBe("Puer natus est");
    expect(screen.getByText("— Editado")).toBeTruthy();
  });

  it("título digitado e Ctrl+N confirmado: o título não vaza para o projeto novo", async () => {
    render(<App />);
    fireEvent.click(await screen.findByRole("button", { name: "Novo projeto" }));
    await screen.findByPlaceholderText("Ex.: Sanctus XVII");
    await wait(350);
    vi.spyOn(window, "confirm").mockReturnValue(true);
    fireEvent.change(screen.getByPlaceholderText("Ex.: Sanctus XVII"), { target: { value: "Puer natus est" } });
    ctrl("n");
    await wait(350);
    expect((screen.getByPlaceholderText("Ex.: Sanctus XVII") as HTMLInputElement).value).toBe("Sem título");
    expect(screen.queryByText("— Editado")).toBeNull();
  });

  it("caixa movida no Recortes e Ctrl+N antes de 300 ms: pergunta antes de descartar", async () => {
    Element.prototype.scrollIntoView = vi.fn();
    window.mocquereau.openProject = vi.fn().mockResolvedValue({ project: projectWithBox(), filePath: null });
    render(<App />);
    fireEvent.click(await screen.findByRole("button", { name: "Abrir…" }));
    await screen.findByDisplayValue("Introito");
    ctrl("3");
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    fireEvent.keyDown(window, { key: "ArrowRight" });
    ctrl("n");
    expect(confirm).toHaveBeenCalledOnce();
    expect(tab("Recortes").getAttribute("aria-selected")).toBe("true");
    expect(screen.getByText("— Editado")).toBeTruthy();
  });

  it("pedido de salvar do main (Fechar > Salvar) grava o título ainda no debounce, mesmo com diálogo aberto", async () => {
    let requestSave: () => void = () => undefined;
    const unsubscribe = vi.fn();
    const onSaveRequested = vi.fn((cb: () => void) => {
      requestSave = cb;
      return unsubscribe;
    });
    const saveProject = vi.fn().mockResolvedValue({ filePath: "/p/puer.mocquereau" });
    Object.assign(window.mocquereau, { onSaveRequested, saveProject });
    window.mocquereau.openProject = vi.fn().mockResolvedValue({ project: projectWithBox(), filePath: "/p/i.mocquereau" });
    const { unmount } = render(<App />);
    fireEvent.click(await screen.findByRole("button", { name: "Abrir…" }));
    await screen.findByDisplayValue("Introito");
    expect(onSaveRequested).toHaveBeenCalledOnce();
    fireEvent.change(screen.getByDisplayValue("Introito"), { target: { value: "Introito X" } });
    ctrl("e");
    expect(screen.getByRole("dialog")).toBeTruthy();
    await act(async () => {
      requestSave();
    });
    expect(saveProject).toHaveBeenCalledOnce();
    expect(saveProject.mock.calls[0][0].meta.title).toBe("Introito X");
    expect(saveProject.mock.calls[0][1]).toBe("/p/i.mocquereau");
    unmount();
    expect(unsubscribe).toHaveBeenCalledOnce();
  });

  it("título digitado: o main sabe que há alterações antes dos 300 ms do debounce", async () => {
    render(<App />);
    fireEvent.click(await screen.findByRole("button", { name: "Novo projeto" }));
    await screen.findByPlaceholderText("Ex.: Sanctus XVII");
    await wait(50);
    const setDirty = window.mocquereau.setDirty as ReturnType<typeof vi.fn>;
    setDirty.mockClear();
    fireEvent.change(screen.getByPlaceholderText("Ex.: Sanctus XVII"), { target: { value: "Puer natus est" } });
    expect(setDirty).toHaveBeenLastCalledWith(true);
  });

  it("texto litúrgico digitado: o main sabe que há alterações antes dos 300 ms", async () => {
    window.mocquereau.openProject = vi.fn().mockResolvedValue({ project: projectWithBox(), filePath: null });
    render(<App />);
    fireEvent.click(await screen.findByRole("button", { name: "Abrir…" }));
    const raw = await screen.findByDisplayValue("Puer natus est");
    await wait(50);
    const setDirty = window.mocquereau.setDirty as ReturnType<typeof vi.fn>;
    setDirty.mockClear();
    fireEvent.change(raw, { target: { value: "Puer natus est nobis" } });
    expect(setDirty).toHaveBeenLastCalledWith(true);
  });

  it("caixa movida no Recortes: o main sabe que há alterações antes dos 300 ms", async () => {
    Element.prototype.scrollIntoView = vi.fn();
    window.mocquereau.openProject = vi.fn().mockResolvedValue({ project: projectWithBox(), filePath: null });
    render(<App />);
    fireEvent.click(await screen.findByRole("button", { name: "Abrir…" }));
    await screen.findByDisplayValue("Introito");
    ctrl("3");
    await wait(50);
    const setDirty = window.mocquereau.setDirty as ReturnType<typeof vi.fn>;
    setDirty.mockClear();
    fireEvent.keyDown(window, { key: "ArrowRight" });
    expect(setDirty).toHaveBeenLastCalledWith(true);
  });
});

