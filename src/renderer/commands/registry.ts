// src/renderer/commands/registry.ts
//
// Single source of commands (spec D10): the same definitions feed the menubar,
// the native macOS menu (through MenuModel), shortcuts, context menus and
// toolbar buttons. Pure: no React, no IPC; wiring is wave B.
import type { MenuItemModel, MenuModel } from "@shared/commands";
import { matchAccelerator, type KeyLike } from "./accelerator";
import type { BaseCommandContext, Command, MenuLayoutItem, MenuLayoutMenu, Translate } from "./types";

// Commands carry their own argument types; the registry stores them erased.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyCommand<C extends BaseCommandContext> = Command<C, any>;

export class CommandRegistry<C extends BaseCommandContext> {
  private readonly commands = new Map<string, AnyCommand<C>>();

  register(command: AnyCommand<C>): () => void {
    if (this.commands.has(command.id)) throw new Error(`Command already registered: ${command.id}`);
    this.commands.set(command.id, command);
    return () => {
      if (this.commands.get(command.id) === command) this.commands.delete(command.id);
    };
  }

  get(id: string): AnyCommand<C> | undefined {
    return this.commands.get(id);
  }

  list(): AnyCommand<C>[] {
    return [...this.commands.values()];
  }

  isEnabled(id: string, ctx: C, args?: unknown): boolean {
    const command = this.commands.get(id);
    return !!command && (command.isEnabled?.(ctx, args) ?? true);
  }

  async execute(id: string, ctx: C, args?: unknown): Promise<boolean> {
    const command = this.commands.get(id);
    if (!command || !this.isEnabled(id, ctx, args)) return false;
    await command.run(ctx, args);
    return true;
  }

  findByKeyboard(event: KeyLike, ctx: C): AnyCommand<C> | null {
    for (const command of this.commands.values()) {
      const accelerators = [command.accelerator, ...(command.altAccelerators ?? [])].filter(
        (a): a is string => !!a,
      );
      if (!accelerators.some((a) => matchAccelerator(a, event, ctx.platform))) continue;
      if (ctx.focusIsText && !command.allowInTextInput) return null;
      return command;
    }
    return null;
  }
}

export function buildMenuModel<C extends BaseCommandContext>(
  registry: CommandRegistry<C>,
  layout: MenuLayoutMenu<C>[],
  ctx: C,
  t: Translate,
): MenuModel {
  const build = (items: MenuLayoutItem<C>[]): MenuItemModel[] => {
    const out: MenuItemModel[] = [];
    for (const item of items) {
      if (item.type === "separator") {
        if (out.length > 0 && out[out.length - 1].type !== "separator") out.push({ type: "separator" });
        continue;
      }
      if (item.type === "submenu") {
        const children = typeof item.items === "function" ? item.items(ctx) : item.items;
        out.push({ type: "submenu", id: item.id, label: t(item.labelKey), items: build(children) });
        continue;
      }
      const command = registry.get(item.id);
      if (!command) continue;
      const model: Extract<MenuItemModel, { type: "command" }> = {
        type: "command",
        id: item.id,
        label: t(command.labelKey, command.labelArgs?.(ctx)),
        enabled: registry.isEnabled(item.id, ctx, item.args),
      };
      if (command.accelerator) model.accelerator = command.accelerator;
      if (command.isChecked) model.checked = command.isChecked(ctx);
      if (item.args !== undefined) model.args = item.args;
      out.push(model);
    }
    while (out.length > 0 && out[out.length - 1].type === "separator") out.pop();
    return out;
  };
  return { menus: layout.map((m) => ({ id: m.id, label: t(m.labelKey), items: build(m.items) })) };
}
