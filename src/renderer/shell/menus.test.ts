// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { buildMenus, type MenuActions, type MenuState } from "./menus";
import type { MenuCommand, MenuDefinition, MenuEntry, MenuSubmenu } from "./menuTypes";

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
    undo: vi.fn(),
    redo: vi.fn(),
    setView: vi.fn(),
    setTheme: vi.fn(),
    setLanguage: vi.fn(),
    openWebsite: vi.fn(),
    reportIssue: vi.fn(),
  };
}

const base: MenuState = { hasProject: true, canExport: true, view: "fontes", theme: "dark", language: "en", canUndo: true, canRedo: false };

function flat(items: MenuEntry[]): MenuCommand[] {
  return items.flatMap((item) => (item === "separator" ? [] : "items" in item ? flat(item.items) : [item]));
}

function find(menus: MenuDefinition[], id: string): MenuCommand {
  const hit = menus.flatMap((m) => flat(m.items)).find((item) => item.id === id);
  if (!hit) throw new Error(`item ${id} ausente`);
  return hit;
}

function submenu(menus: MenuDefinition[], id: string): MenuSubmenu {
  for (const menu of menus) {
    for (const item of menu.items) if (item !== "separator" && "items" in item && item.id === id) return item;
  }
  throw new Error(`submenu ${id} ausente`);
}

describe("buildMenus", () => {
  it("monta Arquivo, Editar, Exibir e Ajuda nessa ordem", () => {
    expect(buildMenus(base, actions(), t).map((m) => m.label)).toEqual([
      "shell.menu.file",
      "shell.menu.edit",
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

  it("Editar: Desfazer/Refazer seguem o histórico, com Ctrl+Y como atalho extra e nativos em campos", () => {
    const a = actions();
    const menus = buildMenus(base, a, t);
    const undo = find(menus, "edit.undo");
    const redo = find(menus, "edit.redo");
    expect(undo.accelerator).toBe("Ctrl+Z");
    expect(undo.disabled).toBe(false);
    expect(redo.accelerator).toBe("Ctrl+Shift+Z");
    expect(redo.altAccelerators).toEqual(["Ctrl+Y"]);
    expect(redo.disabled).toBe(true);
    expect(undo.nativeInTextInput && redo.nativeInTextInput).toBe(true);
    undo.onSelect();
    expect(a.undo).toHaveBeenCalledOnce();
    expect(find(buildMenus({ ...base, hasProject: false }, a, t), "edit.undo").disabled).toBe(true);
  });

  it("idiomas ficam num submenu do Exibir, com rótulo bilíngue e endônimos sem emoji", () => {
    const tl = (key: string) => (key === "shell.language" ? "言語" : key);
    const menus = buildMenus({ ...base, language: "ja" }, actions(), tl);
    const view = menus.find((m) => m.id === "view")!;
    expect(view.items.some((i) => i !== "separator" && "id" in i && i.id.startsWith("lang."))).toBe(false);
    const lang = submenu(menus, "view.language");
    expect(lang.label).toBe("言語 / Language");
    expect(lang.icon).toBeTruthy();
    expect(lang.items.map((i) => (i as MenuCommand).label)).toEqual([
      "Português",
      "English",
      "Italiano",
      "Español",
      "Deutsch",
      "Polski",
      "日本語",
    ]);
    expect(find(menus, "lang.ja").checked).toBe(true);
    expect(find(menus, "lang.en").checked).toBe(false);
    for (const item of lang.items) expect((item as MenuCommand).label).not.toMatch(/\p{Extended_Pictographic}|\p{Regional_Indicator}/u);
  });

  it("em inglês o submenu se chama só 'Language'", () => {
    const tl = (key: string) => (key === "shell.language" ? "Language" : key);
    expect(submenu(buildMenus(base, actions(), tl), "view.language").label).toBe("Language");
  });
});
