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
    editClassification: vi.fn(),
    exportDocx: vi.fn(),
    closeProject: vi.fn(),
    undo: vi.fn(),
    redo: vi.fn(),
    setView: vi.fn(),
    setTheme: vi.fn(),
    setLanguage: vi.fn(),
    openWebsite: vi.fn(),
    reportIssue: vi.fn(),
    openExample: vi.fn(),
    clearRecent: vi.fn(),
    removeBox: vi.fn(),
    clearPage: vi.fn(),
    realignBoxes: vi.fn(),
    nextSource: vi.fn(),
    suggest: vi.fn(),
    suggestSource: vi.fn(),
    acceptAllSuggestions: vi.fn(),
    discardSuggestions: vi.fn(),
    toggleSuggestions: vi.fn(),
  };
}

const NO_SUGGESTIONS = { suggestionsEnabled: false, canSuggest: false, canSuggestSource: false, hasSuggestions: false };

const base: MenuState = { hasProject: true, canExport: true, view: "texto", theme: "dark", language: "en", canUndo: true, canRedo: false };

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
    for (const id of ["file.save", "file.saveAs", "file.importGueranger", "file.classification", "file.exportDocx", "file.close"]) {
      expect(find(menus, id).disabled).toBe(true);
    }
    for (const id of ["view.texto", "view.recortes", "view.tabela"]) {
      expect(find(menus, id).disabled).toBe(true);
      expect(find(menus, id).checked).toBe(false);
    }
  });

  it("marca a vista, o tema e o idioma atuais; atalhos das vistas são Ctrl+1…3", () => {
    const menus = buildMenus(base, actions(), t);
    expect(find(menus, "view.texto").checked).toBe(true);
    expect(find(menus, "view.recortes").checked).toBe(false);
    expect(find(menus, "view.tabela").accelerator).toBe("Ctrl+3");
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

  it("Ajuda tem o projeto de exemplo e o item chama a ação", () => {
    const a = actions();
    find(buildMenus(base, a, t), "help.openExample").onSelect();
    expect(a.openExample).toHaveBeenCalledTimes(1);
  });

  it("Classificação… fica no Arquivo, habilitada só com projeto aberto, e chama a ação", () => {
    const a = actions();
    const item = find(buildMenus(base, a, t), "file.classification");
    expect(item.label).toBe("shell.file.classification");
    expect(item.disabled).toBe(false);
    item.onSelect();
    expect(a.editClassification).toHaveBeenCalledOnce();
    expect(find(buildMenus({ ...base, hasProject: false }, a, t), "file.classification").disabled).toBe(true);
  });

  it("Limpar recentes só aparece sem projeto aberto", () => {
    const a = actions();
    const sem = buildMenus({ ...base, hasProject: false }, a, t);
    find(sem, "file.clearRecent").onSelect();
    expect(a.clearRecent).toHaveBeenCalledTimes(1);
    expect(() => find(buildMenus(base, a, t), "file.clearRecent")).toThrow();
  });

  it("menu Recortes só existe na vista Recortes, entre Exibir e Ajuda", () => {
    expect(buildMenus(base, actions(), t).some((m) => m.id === "recortes")).toBe(false);
    expect(buildMenus({ ...base, view: "recortes", hasProject: false }, actions(), t).some((m) => m.id === "recortes")).toBe(false);
    expect(buildMenus({ ...base, view: "recortes" }, actions(), t).map((m) => m.id)).toEqual(["file", "edit", "view", "recortes", "help"]);
  });

  it("menu Recortes: itens, atalhos, estados e ações", () => {
    const a = actions();
    const recortes = { ...NO_SUGGESTIONS, canRemoveBox: true, canClearPage: true, canRealign: false, hasNextSource: true };
    const menus = buildMenus({ ...base, view: "recortes", recortes }, a, t);
    const menu = menus.find((m) => m.id === "recortes")!;
    expect(menu.label).toBe("shell.view.recortes");
    expect(flat(menu.items).map((i) => [i.id, i.label, i.accelerator, i.disabled])).toEqual([
      ["recortes.removeBox", "recortes.menu.removeBox", "Delete", false],
      ["recortes.clearPage", "recortes.menu.clearPage", undefined, false],
      ["recortes.realign", "recortes.menu.realign", undefined, true],
      ["recortes.suggestionsEnabled", "recortes.menu.suggestionsEnabled", undefined, false],
      ["recortes.nextSource", "recortes.menu.nextSource", "Ctrl+Enter", false],
    ]);
    for (const id of ["recortes.removeBox", "recortes.clearPage", "recortes.realign", "recortes.nextSource"]) find(menus, id).onSelect();
    expect(a.removeBox).toHaveBeenCalledOnce();
    expect(a.clearPage).toHaveBeenCalledOnce();
    expect(a.realignBoxes).toHaveBeenCalledOnce();
    expect(a.nextSource).toHaveBeenCalledOnce();
    // Sem estado do Recortes, tudo desabilitado.
    const bare = buildMenus({ ...base, view: "recortes" }, a, t).find((m) => m.id === "recortes")!;
    expect(flat(bare.items).every((i) => i.disabled)).toBe(true);
  });

  it("menu Recortes: sugestões com a preferência ligada (S6, S8, S10)", () => {
    const a = actions();
    const on = { canRemoveBox: false, canClearPage: false, canRealign: false, hasNextSource: false, suggestionsEnabled: true, canSuggest: true, canSuggestSource: true, hasSuggestions: true };
    const menus = buildMenus({ ...base, view: "recortes", recortes: on }, a, t);
    const menu = menus.find((m) => m.id === "recortes")!;
    const rows = flat(menu.items).map((i) => [i.id, i.label, i.accelerator, i.disabled, i.checked]);
    expect(rows).toEqual(
      expect.arrayContaining([
        ["recortes.suggest", "recortes.menu.suggest", "Ctrl+Shift+G", false, undefined],
        ["recortes.suggestSource", "recortes.menu.suggestSource", undefined, false, undefined],
        ["recortes.acceptAll", "recortes.menu.acceptAll", "Ctrl+Shift+Enter", false, undefined],
        ["recortes.discard", "recortes.menu.discard", undefined, false, undefined],
        ["recortes.suggestionsEnabled", "recortes.menu.suggestionsEnabled", undefined, false, true],
      ]),
    );
    for (const id of ["recortes.suggest", "recortes.suggestSource", "recortes.acceptAll", "recortes.discard", "recortes.suggestionsEnabled"]) {
      find(menus, id).onSelect();
    }
    expect(a.suggest).toHaveBeenCalledOnce();
    expect(a.suggestSource).toHaveBeenCalledOnce();
    expect(a.acceptAllSuggestions).toHaveBeenCalledOnce();
    expect(a.discardSuggestions).toHaveBeenCalledOnce();
    expect(a.toggleSuggestions).toHaveBeenCalledOnce();

    // Sem sugestões na página: Aceitar e Descartar desabilitados.
    const none = buildMenus({ ...base, view: "recortes", recortes: { ...on, hasSuggestions: false, canSuggest: false, canSuggestSource: false } }, a, t);
    expect(find(none, "recortes.acceptAll").disabled).toBe(true);
    expect(find(none, "recortes.discard").disabled).toBe(true);
    expect(find(none, "recortes.suggest").disabled).toBe(true);
    expect(find(none, "recortes.suggestSource").disabled).toBe(true);

    // Preferência desligada: só o item marcável fica.
    const off = buildMenus({ ...base, view: "recortes", recortes: { ...on, suggestionsEnabled: false } }, a, t);
    const ids = flat(off.find((m) => m.id === "recortes")!.items).map((i) => i.id);
    expect(ids).toContain("recortes.suggestionsEnabled");
    for (const id of ["recortes.suggest", "recortes.suggestSource", "recortes.acceptAll", "recortes.discard"]) expect(ids).not.toContain(id);
    expect(find(off, "recortes.suggestionsEnabled").checked).toBe(false);
  });
});
