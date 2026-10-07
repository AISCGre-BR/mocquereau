import { useEffect, useRef } from "react";
import { matchAccelerator, type AcceleratorEvent } from "./accelerator";
import type { MenuCommand, MenuDefinition } from "./menuTypes";

/** Primeiro comando habilitado cujo atalho casa com o evento. */
export function findShortcut(menus: MenuDefinition[], e: AcceleratorEvent): MenuCommand | null {
  for (const menu of menus) {
    for (const item of menu.items) {
      if (item === "separator" || !item.accelerator || item.disabled) continue;
      if (matchAccelerator(item.accelerator, e)) return item;
    }
  }
  return null;
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
      e.preventDefault();
      command.onSelect();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);
}
