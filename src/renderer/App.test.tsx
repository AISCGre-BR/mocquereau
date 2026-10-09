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
    getSuggestionsEnabled: vi.fn().mockResolvedValue(true),
    setSuggestionsEnabled: vi.fn().mockResolvedValue(true),
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

/** Percorre o guia de criação já aberto (título vazio, modo padrão) e cria o projeto. */
async function finishGuide(text = "Puer natus est") {
  fireEvent.click(await screen.findByRole("button", { name: "Continuar" }));
  fireEvent.change(screen.getByPlaceholderText("Cole ou digite o texto litúrgico"), { target: { value: text } });
  fireEvent.click(screen.getByRole("button", { name: "Continuar" }));
  fireEvent.click(screen.getByRole("button", { name: "Continuar" }));
  fireEvent.click(screen.getByRole("button", { name: "Criar projeto" }));
  await screen.findByPlaceholderText("Título");
}

/** Novo projeto na tela inicial, passando pelo guia. */
async function createViaGuide() {
  fireEvent.click(await screen.findByRole("button", { name: "Novo projeto" }));
  await finishGuide();
}

describe("App", () => {
  it("abre na Welcome, sem toolbar; Ctrl+2 sem projeto não faz nada", async () => {
    render(<App />);
    expect(await screen.findByRole("button", { name: "Novo projeto" })).toBeTruthy();
    expect(screen.queryByRole("tablist")).toBeNull();
    ctrl("2");
    expect(screen.queryByRole("tablist")).toBeNull();
    expect(screen.getByText("Mocquereau", { selector: ".sc-menubar__title span" })).toBeTruthy();
  });

  it("Novo projeto leva ao Texto; Ctrl+2 e Ctrl+3 trocam de vista; não há Avançar/Voltar", async () => {
    render(<App />);
    await createViaGuide();
    expect(tab("Texto").getAttribute("aria-selected")).toBe("true");
    expect(screen.getAllByRole("tab").map((t) => t.textContent)).toEqual(["Texto", "Recortes", "Tabela"]);
    ctrl("2");
    expect(tab("Recortes").getAttribute("aria-selected")).toBe("true");
    ctrl("3");
    expect(tab("Tabela").getAttribute("aria-selected")).toBe("true");
    expect((screen.getByRole("button", { name: /Exportar DOCX/ }) as HTMLButtonElement).disabled).toBe(true);
    for (const label of [/Próximo/, /Anterior/]) {
      expect(screen.queryByRole("button", { name: label })).toBeNull();
    }
  });

  it("projeto criado com texto marca '— Editado' (ainda não está em arquivo); trocar de vista não cria passo", async () => {
    render(<App />);
    await createViaGuide();
    await wait(350);
    expect(screen.getByText("— Editado")).toBeTruthy();
    ctrl("3");
    ctrl("1");
    await wait(350);
    // Nada a desfazer: trocar de vista não editou o projeto.
    ctrl("z");
    expect((screen.getByPlaceholderText("Título") as HTMLInputElement).value).toBe("Sem título");
    expect(screen.getByText("— Editado")).toBeTruthy();
  });

  it("abrir outro logo depois de criar pelo guia pergunta antes de descartar", async () => {
    render(<App />);
    await createViaGuide();
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    ctrl("o");
    expect(confirm).toHaveBeenCalledOnce();
    expect(window.mocquereau.openProject).not.toHaveBeenCalled();
  });

  it("Novo projeto abre o guia sem toolbar, com o título da janela; Cancelar volta à tela inicial", async () => {
    render(<App />);
    fireEvent.click(await screen.findByRole("button", { name: "Novo projeto" }));
    expect(screen.getByPlaceholderText("Título da peça")).toBeTruthy();
    expect(screen.queryByRole("tablist")).toBeNull();
    expect(screen.getByText("Novo projeto", { selector: ".sc-menubar__title span" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));
    expect(await screen.findByRole("button", { name: "Novo projeto" })).toBeTruthy();
    expect(screen.queryByPlaceholderText("Título da peça")).toBeNull();
  });

  it("Ctrl+N com projeto editado confirma o descarte; Cancelar no guia volta ao projeto intacto", async () => {
    render(<App />);
    await createViaGuide();
    fireEvent.change(screen.getByPlaceholderText("Título"), { target: { value: "Puer natus est" } });
    await wait(350);
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(true);
    ctrl("n");
    expect(confirm).toHaveBeenCalledOnce();
    expect(screen.getByPlaceholderText("Título da peça")).toBeTruthy();
    expect(screen.queryByRole("tablist")).toBeNull();
    fireEvent.keyDown(window, { key: "Escape" });
    expect((screen.getByPlaceholderText("Título") as HTMLInputElement).value).toBe("Puer natus est");
    expect(screen.getByText("— Editado")).toBeTruthy();
    expect(tab("Texto").getAttribute("aria-selected")).toBe("true");
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
    await createViaGuide();
    vi.spyOn(window, "confirm").mockReturnValue(true);
    ctrl("3");
    ctrl("o");
    expect(await screen.findByDisplayValue("Sanctus VIII")).toBeTruthy();
    expect(tab("Texto").getAttribute("aria-selected")).toBe("true");
  });

  it("Editar > Desfazer (Ctrl+Z fora de campos) volta o título; dentro do campo o Ctrl+Z é do campo", async () => {
    render(<App />);
    await createViaGuide();
    const titleInput = screen.getByPlaceholderText("Título") as HTMLInputElement;
    fireEvent.change(titleInput, { target: { value: "Puer natus est" } });
    await wait(350);
    expect(screen.getByText("— Editado")).toBeTruthy();
    // Dentro do campo: o app não intercepta.
    fireEvent.keyDown(titleInput, { key: "z", ctrlKey: true });
    expect((screen.getByPlaceholderText("Título") as HTMLInputElement).value).toBe("Puer natus est");
    ctrl("z");
    expect((screen.getByPlaceholderText("Título") as HTMLInputElement).value).toBe("Sem título");
    // O projeto criado pelo guia continua editado: nunca foi gravado.
    expect(screen.getByText("— Editado")).toBeTruthy();
    fireEvent.keyDown(window, { key: "y", ctrlKey: true });
    expect((screen.getByPlaceholderText("Título") as HTMLInputElement).value).toBe("Puer natus est");
  });

  it("título digitado e Ctrl+N antes de 300 ms: pergunta antes de descartar; Cancelar mantém o título", async () => {
    render(<App />);
    await createViaGuide();
    await wait(350);
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    fireEvent.change(screen.getByPlaceholderText("Título"), { target: { value: "Puer natus est" } });
    ctrl("n");
    expect(confirm).toHaveBeenCalledOnce();
    expect((screen.getByPlaceholderText("Título") as HTMLInputElement).value).toBe("Puer natus est");
    expect(screen.getByText("— Editado")).toBeTruthy();
  });

  it("título digitado e Ctrl+N confirmado: o título não vaza para o projeto novo", async () => {
    render(<App />);
    await createViaGuide();
    await wait(350);
    vi.spyOn(window, "confirm").mockReturnValue(true);
    fireEvent.change(screen.getByPlaceholderText("Título"), { target: { value: "Puer natus est" } });
    ctrl("n");
    await finishGuide();
    await wait(350);
    expect((screen.getByPlaceholderText("Título") as HTMLInputElement).value).toBe("Sem título");
  });

  it("caixa removida no Recortes e Ctrl+N: pergunta antes de descartar", async () => {
    Element.prototype.scrollIntoView = vi.fn();
    window.mocquereau.openProject = vi.fn().mockResolvedValue({ project: projectWithBox(), filePath: null });
    render(<App />);
    fireEvent.click(await screen.findByRole("button", { name: "Abrir…" }));
    await screen.findByDisplayValue("Introito");
    ctrl("2");
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    fireEvent.keyDown(window, { key: "Delete" });
    ctrl("n");
    expect(confirm).toHaveBeenCalledOnce();
    expect(tab("Recortes").getAttribute("aria-selected")).toBe("true");
    expect(screen.getByText("— Editado")).toBeTruthy();
  });

  it("Adicionar fonte na Texto abre Recortes com o diálogo Fonte de uma fonte nova", async () => {
    Element.prototype.scrollIntoView = vi.fn();
    render(<App />);
    await createViaGuide();
    fireEvent.click(screen.getByRole("button", { name: "Adicionar fonte" }));
    expect(tab("Recortes").getAttribute("aria-selected")).toBe("true");
    const dialog = await screen.findByRole("dialog");
    expect(dialog.getAttribute("aria-label") ?? dialog.querySelector("h2")?.textContent).toBe("Fonte");
    expect(document.querySelectorAll("[role=treeitem][data-source-id]").length).toBe(1);
  });

  it("clique numa célula vazia da Tabela abre Recortes na fonte e na sílaba", async () => {
    Element.prototype.scrollIntoView = vi.fn();
    const project = projectWithBox();
    const second = { ...project.sources[0], id: "src-2", order: 1, metadata: { ...project.sources[0].metadata, siglum: "B" } };
    second.lines = [{ ...second.lines[0], id: "line-2", syllableRange: { start: 0, end: 4 }, syllableBoxes: {}, confirmed: false }];
    window.mocquereau.openProject = vi.fn().mockResolvedValue({ project: { ...project, sources: [project.sources[0], second] }, filePath: null });
    const { container } = render(<App />);
    fireEvent.click(await screen.findByRole("button", { name: "Abrir…" }));
    await screen.findByDisplayValue("Introito");
    ctrl("3");
    // Pendentes: 4 da fonte A (sílabas 1-4), depois 5 da fonte B; o 8º é a sílaba 3 de B.
    const pending = container.querySelectorAll('[title="Recorte pendente"]');
    expect(pending.length).toBe(9);
    fireEvent.click(pending[7]);
    expect(tab("Recortes").getAttribute("aria-selected")).toBe("true");
    expect(container.querySelector('[role=treeitem][aria-selected=true][data-line-id="line-2"]')).not.toBeNull();
    expect(container.querySelector('[data-syllable="3"][aria-pressed=true]')).not.toBeNull();
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
    await createViaGuide();
    await wait(50);
    const setDirty = window.mocquereau.setDirty as ReturnType<typeof vi.fn>;
    setDirty.mockClear();
    fireEvent.change(screen.getByPlaceholderText("Título"), { target: { value: "Puer natus est" } });
    expect(setDirty).toHaveBeenLastCalledWith(true);
  });

  it("texto litúrgico digitado: o main sabe que há alterações antes dos 300 ms", async () => {
    window.mocquereau.openProject = vi.fn().mockResolvedValue({ project: projectWithBox(), filePath: null });
    render(<App />);
    fireEvent.click(await screen.findByRole("button", { name: "Abrir…" }));
    fireEvent.doubleClick(await screen.findByTestId("texto-body"));
    const raw = screen.getByDisplayValue("Puer natus est");
    await wait(50);
    const setDirty = window.mocquereau.setDirty as ReturnType<typeof vi.fn>;
    setDirty.mockClear();
    fireEvent.change(raw, { target: { value: "Puer natus est nobis" } });
    expect(setDirty).toHaveBeenLastCalledWith(true);
  });

  it("caixa removida no Recortes: o main sabe que há alterações na hora", async () => {
    Element.prototype.scrollIntoView = vi.fn();
    window.mocquereau.openProject = vi.fn().mockResolvedValue({ project: projectWithBox(), filePath: null });
    render(<App />);
    fireEvent.click(await screen.findByRole("button", { name: "Abrir…" }));
    await screen.findByDisplayValue("Introito");
    ctrl("2");
    await wait(50);
    const setDirty = window.mocquereau.setDirty as ReturnType<typeof vi.fn>;
    setDirty.mockClear();
    fireEvent.keyDown(window, { key: "Delete" });
    expect(setDirty).toHaveBeenLastCalledWith(true);
  });

  it("Desfazer no Recortes devolve a caixa à folha sem remontar a vista", async () => {
    Element.prototype.scrollIntoView = vi.fn();
    window.mocquereau.openProject = vi.fn().mockResolvedValue({ project: projectWithBox(), filePath: null });
    const { container } = render(<App />);
    fireEvent.click(await screen.findByRole("button", { name: "Abrir…" }));
    await screen.findByDisplayValue("Introito");
    ctrl("2");
    const sheet = container.querySelector("[data-image-wrapper]") as HTMLElement;
    expect(sheet.querySelector("[data-box-overlay]")).not.toBeNull();
    fireEvent.keyDown(window, { key: "Delete" });
    expect(sheet.querySelector("[data-box-overlay]")).toBeNull();
    ctrl("z");
    expect(container.querySelector("[data-image-wrapper]")).toBe(sheet);
    expect(sheet.querySelector("[data-box-overlay]")).not.toBeNull();
  });

  it("Recortes: ferramentas na barra e menu Recortes só nessa vista; Ctrl+Enter vai à próxima fonte", async () => {
    Element.prototype.scrollIntoView = vi.fn();
    const project = projectWithBox();
    const second = { ...project.sources[0], id: "src-2", metadata: { ...project.sources[0].metadata, siglum: "B" } };
    second.lines = [{ ...second.lines[0], id: "line-2", syllableBoxes: {}, confirmed: false }];
    window.mocquereau.openProject = vi.fn().mockResolvedValue({ project: { ...project, sources: [project.sources[0], second] }, filePath: null });
    const { container } = render(<App />);
    fireEvent.click(await screen.findByRole("button", { name: "Abrir…" }));
    await screen.findByDisplayValue("Introito");
    expect(screen.queryByRole("button", { name: "Desenhar caixa" })).toBeNull();
    expect(screen.queryByRole("menuitem", { name: "Recortes" })).toBeNull();
    ctrl("2");
    expect(screen.getByRole("button", { name: "Desenhar caixa" })).toBeTruthy();
    expect(screen.getByRole("button", { name: /Imagem/ })).toBeTruthy();
    expect(screen.getByRole("menuitem", { name: "Recortes" })).toBeTruthy();
    expect(container.querySelector("[data-box-overlay]")).not.toBeNull();
    fireEvent.keyDown(window, { key: "Enter", ctrlKey: true });
    expect(container.querySelector("[data-box-overlay]")).toBeNull();
    expect(container.querySelector('[role=treeitem][aria-selected=true][data-line-id="line-2"]')).not.toBeNull();
  });
  it("abrir outro projeto esquece as fontes abertas na árvore do Recortes", async () => {
    Element.prototype.scrollIntoView = vi.fn();
    const project = projectWithBox();
    const second = { ...project.sources[0], id: "src-2", order: 1, metadata: { ...project.sources[0].metadata, siglum: "B" } };
    second.lines = [{ ...second.lines[0], id: "line-2" }];
    const opened = { ...project, sources: [project.sources[0], second] };
    window.mocquereau.openProject = vi.fn().mockResolvedValue({ project: opened, filePath: null });
    vi.spyOn(window, "confirm").mockReturnValue(true);
    const { container } = render(<App />);
    fireEvent.click(await screen.findByRole("button", { name: "Abrir…" }));
    await screen.findByDisplayValue("Introito");
    ctrl("2");
    const other = () => container.querySelector('[role=treeitem][data-source-id="src-2"]') as HTMLElement;
    expect(other().getAttribute("aria-expanded")).toBe("false");
    fireEvent.keyDown(other(), { key: "ArrowRight" });
    expect(other().getAttribute("aria-expanded")).toBe("true");
    ctrl("1");
    ctrl("2");
    expect(other().getAttribute("aria-expanded")).toBe("true"); // mesma sessão: lembrada
    ctrl("o");
    await screen.findByDisplayValue("Introito");
    ctrl("2");
    expect(other().getAttribute("aria-expanded")).toBe("false");
  });
});

