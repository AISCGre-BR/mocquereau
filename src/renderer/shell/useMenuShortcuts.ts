import { useEffect, useRef } from "react";
import { matchAccelerator, type AcceleratorEvent } from "./accelerator";
import { isSubmenu, type MenuCommand, type MenuDefinition, type MenuEntry } from "./menuTypes";

/** Primeiro comando habilitado cujo atalho (principal ou extra) casa com o evento. */
export function findShortcut(menus: MenuDefinition[], e: AcceleratorEvent): MenuCommand | null {
  function* commands(items: MenuEntry[]): Generator<MenuCommand> {
    for (const item of items) {
      if (item === "separator") continue;
      if (isSubmenu(item)) yield* commands(item.items);
      else yield item;
    }
  }
  for (const menu of menus) {
    for (const item of commands(menu.items)) {
      if (item.disabled) continue;
      const accels = [item.accelerator, ...(item.altAccelerators ?? [])].filter((a): a is string => !!a);
      if (accels.some((a) => matchAccelerator(a, e))) return item;
    }
  }
  return null;
}

/** Campo onde Ctrl+Z/Ctrl+Y nativos desfazem a digitação. */
export function isTextInput(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  if (target.tagName === "TEXTAREA") return true;
  if (target.tagName !== "INPUT") return false;
  const type = (target as HTMLInputElement).type;
  return !["button", "checkbox", "radio", "range", "color", "file", "submit", "reset", "image"].includes(type);
}

/** Atalhos de teclado derivados dos menus: menu, tooltip e teclado chamam o mesmo comando. */
export function useMenuShortcuts(menus: MenuDefinition[]): void {
  const menusRef = useRef(menus);
  menusRef.current = menus;

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (!e.ctrlKey && !e.metaKey) return;
      const command = findShortcut(menusRef.current, e);
      if (!command) return;
      if (command.nativeInTextInput && isTextInput(e.target)) return;
      e.preventDefault();
      // Tecla segurada não abre dez diálogos de Abrir nem alterna vistas sem parar.
      if (e.repeat && !command.allowRepeat) return;
      // Com um menu aberto o teclado é dele: nenhum atalho do app dispara por trás.
      if (document.querySelector('[role="menu"]')) return;
      command.onSelect();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);
}
