import { describe, expect, it, vi } from "vitest";
import { CommandRegistry, buildMenuModel } from "./registry";
import type { BaseCommandContext, MenuLayoutMenu, Translate } from "./types";
import type { KeyLike } from "./accelerator";

interface Ctx extends BaseCommandContext {
  hasProject: boolean;
  autosave: boolean;
  recent: string[];
  undoLabel: string;
}

const ctx = (over: Partial<Ctx> = {}): Ctx => ({
  platform: "linux", focusIsText: false, hasProject: true, autosave: true,
  recent: ["/a.mocquereau", "/b.mocquereau"], undoLabel: "Rotate", ...over,
});

const t: Translate = (key, vars) =>
  vars ? `${key}(${Object.entries(vars).map(([k, v]) => `${k}=${v}`).join(",")})` : key;

const key = (k: string, mods: Partial<KeyLike> = {}): KeyLike => ({
  key: k, ctrlKey: false, metaKey: false, altKey: false, shiftKey: false, ...mods,
});

function makeRegistry() {
  const reg = new CommandRegistry<Ctx>();
  const save = vi.fn();
  const openRecent = vi.fn();
  reg.register({ id: "file.save", labelKey: "commands.save", accelerator: "CmdOrCtrl+S", isEnabled: (c) => c.hasProject, run: save });
  reg.register({ id: "file.autosave", labelKey: "commands.autosave", isChecked: (c) => c.autosave, run: () => {} });
  reg.register({ id: "file.openRecent", labelKey: "commands.openRecent", run: openRecent });
  reg.register({
    id: "edit.undo", labelKey: "commands.undo", labelArgs: (c) => ({ label: c.undoLabel }),
    accelerator: "CmdOrCtrl+Z", allowInTextInput: true, run: () => {},
  });
  reg.register({
    id: "edit.redo", labelKey: "commands.redo", accelerator: "CmdOrCtrl+Shift+Z",
    altAccelerators: ["Ctrl+Y"], run: () => {},
  });
  return { reg, save, openRecent };
}

describe("CommandRegistry", () => {
  it("rejects duplicate ids and unregisters", () => {
    const { reg } = makeRegistry();
    expect(() => reg.register({ id: "file.save", labelKey: "x", run: () => {} })).toThrow(/already registered/);
    const off = reg.register({ id: "source.duplicate", labelKey: "x", run: () => {} });
    expect(reg.get("source.duplicate")).toBeDefined();
    off();
    expect(reg.get("source.duplicate")).toBeUndefined();
  });

  it("execute respects isEnabled, passes args and awaits async commands", async () => {
    const { reg, save, openRecent } = makeRegistry();
    expect(await reg.execute("file.save", ctx({ hasProject: false }))).toBe(false);
    expect(save).not.toHaveBeenCalled();
    expect(await reg.execute("file.save", ctx())).toBe(true);
    expect(save).toHaveBeenCalledTimes(1);
    await reg.execute("file.openRecent", ctx(), "/a.mocquereau");
    expect(openRecent).toHaveBeenCalledWith(expect.objectContaining({ hasProject: true }), "/a.mocquereau");
    let done = false;
    reg.register({ id: "slow", labelKey: "x", run: async () => { await Promise.resolve(); done = true; } });
    await reg.execute("slow", ctx());
    expect(done).toBe(true);
    expect(await reg.execute("does.not.exist", ctx())).toBe(false);
  });

  it("findByKeyboard matches main and alternative accelerators", () => {
    const { reg } = makeRegistry();
    expect(reg.findByKeyboard(key("s", { ctrlKey: true }), ctx())?.id).toBe("file.save");
    expect(reg.findByKeyboard(key("y", { ctrlKey: true }), ctx())?.id).toBe("edit.redo");
    expect(reg.findByKeyboard(key("q", { ctrlKey: true }), ctx())).toBeNull();
  });

  it("findByKeyboard leaves text fields alone unless the command allows it", () => {
    const { reg } = makeRegistry();
    expect(reg.findByKeyboard(key("s", { ctrlKey: true }), ctx({ focusIsText: true }))).toBeNull();
    expect(reg.findByKeyboard(key("z", { ctrlKey: true }), ctx({ focusIsText: true }))?.id).toBe("edit.undo");
  });
});

describe("buildMenuModel", () => {
  const layout: MenuLayoutMenu<Ctx>[] = [
    {
      id: "file",
      labelKey: "menu.file",
      items: [
        { type: "separator" },
        { type: "command", id: "file.save" },
        { type: "separator" },
        { type: "separator" },
        {
          type: "submenu",
          id: "file.openRecent",
          labelKey: "commands.openRecent",
          items: (c) => c.recent.map((p) => ({ type: "command" as const, id: "file.openRecent" as const, args: p })),
        },
        { type: "command", id: "file.autosave" },
        { type: "command", id: "file.exportDocx" },
        { type: "separator" },
      ],
    },
    { id: "edit", labelKey: "menu.edit", items: [{ type: "command", id: "edit.undo" }] },
  ];

  it("builds labels, accelerators, enabled/checked state and dynamic submenus", () => {
    const { reg } = makeRegistry();
    const model = buildMenuModel(reg, layout, ctx({ hasProject: false }), t);
    expect(model.menus.map((m) => m.label)).toEqual(["menu.file", "menu.edit"]);
    expect(model.menus[0].items).toEqual([
      { type: "command", id: "file.save", label: "commands.save", accelerator: "CmdOrCtrl+S", enabled: false },
      { type: "separator" },
      {
        type: "submenu", id: "file.openRecent", label: "commands.openRecent",
        items: [
          { type: "command", id: "file.openRecent", label: "commands.openRecent", enabled: true, args: "/a.mocquereau" },
          { type: "command", id: "file.openRecent", label: "commands.openRecent", enabled: true, args: "/b.mocquereau" },
        ],
      },
      { type: "command", id: "file.autosave", label: "commands.autosave", enabled: true, checked: true },
    ]);
    expect(model.menus[1].items[0]).toEqual({
      type: "command", id: "edit.undo", label: "commands.undo(label=Rotate)", accelerator: "CmdOrCtrl+Z", enabled: true,
    });
  });
});
