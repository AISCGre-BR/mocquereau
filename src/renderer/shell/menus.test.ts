// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { buildMenus, type MenuActions, type MenuState } from "./menus";
import type { MenuCommand, MenuDefinition } from "./menuTypes";

const t = (key: string) => key;

function actions(): MenuActions {
  return {
    newProject: vi.fn(),
    open: vi.fn(),
    save: vi.fn(),
    saveAs: vi.fn(),
    importGueranger: vi.fn(),
    exportDocx: vi.fn(),
    closeProject: vi.fn(),
    setView: vi.fn(),
    setTheme: vi.fn(),
    setLanguage: vi.fn(),
    openWebsite: vi.fn(),
    reportIssue: vi.fn(),
  };
}

const base: MenuState = { hasProject: true, canExport: true, view: "fontes", theme: "dark", language: "en" };

function find(menus: MenuDefinition[], id: string): MenuCommand {
  for (const menu of menus) {
    for (const item of menu.items) if (item !== "separator" && item.id === id) return item;
  }
  throw new Error(`item ${id} ausente`);
}

describe("buildMenus", () => {
  it("monta Arquivo, Exibir e Ajuda nessa ordem", () => {
    expect(buildMenus(base, actions(), t).map((m) => m.label)).toEqual([
      "shell.menu.file",
      "shell.menu.view",
      "shell.menu.help",
    ]);
  });

  it("sem projeto: só Novo e Abrir ficam habilitados no Arquivo; vistas desabilitadas", () => {
    const menus = buildMenus({ ...base, hasProject: false, canExport: false }, actions(), t);
    expect(find(menus, "file.new").disabled).toBeFalsy();
    expect(find(menus, "file.open").disabled).toBeFalsy();
    for (const id of ["file.save", "file.saveAs", "file.importGueranger", "file.exportDocx", "file.close"]) {
      expect(find(menus, id).disabled).toBe(true);
    }
    for (const id of ["view.texto", "view.fontes", "view.recortes", "view.tabela"]) {
      expect(find(menus, id).disabled).toBe(true);
      expect(find(menus, id).checked).toBe(false);
    }
  });

  it("marca a vista, o tema e o idioma atuais; atalhos das vistas são Ctrl+1…4", () => {
    const menus = buildMenus(base, actions(), t);
    expect(find(menus, "view.fontes").checked).toBe(true);
    expect(find(menus, "view.texto").checked).toBe(false);
    expect(find(menus, "view.tabela").accelerator).toBe("Ctrl+4");
    expect(find(menus, "theme.dark").checked).toBe(true);
    expect(find(menus, "theme.system").checked).toBe(false);
    expect(find(menus, "lang.en").checked).toBe(true);
    expect(find(menus, "lang.en").label).toBe("English");
  });

  it("Exportar depende de haver dados exportáveis", () => {
    expect(find(buildMenus({ ...base, canExport: false }, actions(), t), "file.exportDocx").disabled).toBe(true);
    expect(find(buildMenus(base, actions(), t), "file.exportDocx").accelerator).toBe("Ctrl+E");
  });

  it("liga cada item à sua ação", () => {
    const a = actions();
    const menus = buildMenus(base, a, t);
    find(menus, "view.tabela").onSelect();
    find(menus, "theme.light").onSelect();
    find(menus, "lang.pt-BR").onSelect();
    find(menus, "file.saveAs").onSelect();
    expect(a.setView).toHaveBeenCalledWith("tabela");
    expect(a.setTheme).toHaveBeenCalledWith("light");
    expect(a.setLanguage).toHaveBeenCalledWith("pt-BR");
    expect(a.saveAs).toHaveBeenCalledOnce();
  });
});
