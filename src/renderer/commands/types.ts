// src/renderer/commands/types.ts
import type { CommandId, MenuId } from "@shared/commands";

export type Platform = "darwin" | "win32" | "linux";

/** Wave B extends this with doc lifecycle, history, screen and recent files. */
export interface BaseCommandContext {
  platform: Platform;
  focusIsText: boolean;
}

export type Translate = (key: string, vars?: Record<string, string>) => string;

export interface Command<C extends BaseCommandContext = BaseCommandContext, A = unknown> {
  /** Global ids are CommandId; context commands use free strings (e.g. "source.duplicate"). */
  id: CommandId | (string & {});
  labelKey: string;
  labelArgs?(ctx: C): Record<string, string>;
  /** Electron accelerator syntax, e.g. "CmdOrCtrl+Shift+S". */
  accelerator?: string;
  altAccelerators?: string[];
  /** Default false: shortcuts typed inside inputs belong to the field. */
  allowInTextInput?: boolean;
  isEnabled?(ctx: C, args?: A): boolean;
  isChecked?(ctx: C): boolean;
  run(ctx: C, args?: A): void | Promise<void>;
}

export type MenuLayoutItem<C> =
  | { type: "command"; id: CommandId; args?: unknown }
  | { type: "separator" }
  | {
      type: "submenu";
      id: string;
      labelKey: string;
      items: MenuLayoutItem<C>[] | ((ctx: C) => MenuLayoutItem<C>[]);
    };

export interface MenuLayoutMenu<C> {
  id: MenuId;
  labelKey: string;
  items: MenuLayoutItem<C>[];
}
