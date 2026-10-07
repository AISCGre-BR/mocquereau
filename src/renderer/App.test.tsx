// @vitest-environment jsdom
import "./i18n";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { App } from "./App";
import { createNewProject } from "./hooks/useProject";
import type { MocquereauAPI } from "./lib/models";

beforeEach(() => {
  window.mocquereau = {
    platform: "linux",
    getTheme: vi.fn().mockResolvedValue("system"),
    setTheme: vi.fn().mockResolvedValue(true),
    getLanguage: vi.fn().mockResolvedValue("pt-BR"),
    setLanguage: vi.fn().mockResolvedValue("pt-BR"),
    getRecentFiles: vi.fn().mockResolvedValue([]),
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
    ctrl("4");
    ctrl("o");
    expect(await screen.findByDisplayValue("Sanctus VIII")).toBeTruthy();
    expect(tab("Texto").getAttribute("aria-selected")).toBe("true");
  });

  it("Editar > Desfazer (Ctrl+Z fora de campos) volta o título; dentro do campo o Ctrl+Z é do campo", async () => {
    render(<App />);
    fireEvent.click(await screen.findByRole("button", { name: "Novo projeto" }));
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
});

