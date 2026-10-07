// src/shared/commands.ts
//
// Command ids and the serialized menu model (spec section 8). The renderer
// builds the MenuModel from its registry; in wave B the main process turns it
// into the native macOS menu and the React menubar renders it on Win/Linux.

export type CommandId =
  | "file.new" | "file.open" | "file.openRecent" | "file.clearRecent" | "file.save" | "file.saveAs"
  | "file.autosave" | "file.exportDocx" | "file.close" | "app.quit"
  | "edit.undo" | "edit.redo" | "edit.cut" | "edit.copy" | "edit.paste" | "edit.selectAll"
  | "help.tutorial" | "help.about" | "view.devtools";

export type MenuId = "file" | "edit" | "view" | "help";

export type MenuItemModel =
  | {
      type: "command";
      id: CommandId;
      label: string;
      accelerator?: string;
      enabled: boolean;
      checked?: boolean;
      args?: unknown;
    }
  | { type: "separator" }
  | { type: "submenu"; id: string; label: string; items: MenuItemModel[] };

export interface MenuModel {
  menus: { id: MenuId; label: string; items: MenuItemModel[] }[];
}
