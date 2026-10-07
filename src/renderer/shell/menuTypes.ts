import type { ReactNode } from "react";

export interface MenuCommand {
  id: string;
  label: string;
  /** Formato "Ctrl+Shift+S"; aparece no menu e vira atalho de teclado. */
  accelerator?: string;
  /** Atalhos extras (não aparecem no menu), ex.: Ctrl+Y para Refazer. */
  altAccelerators?: string[];
  /**
   * true: com o foco num campo de texto o atalho fica com o campo (ex.: Ctrl+Z
   * desfaz a digitação, não o projeto).
   */
  nativeInTextInput?: boolean;
  /** true: segurar a tecla repete o comando (Desfazer). Padrão: repetição ignorada. */
  allowRepeat?: boolean;
  disabled?: boolean;
  /** Definido = item de alternância. */
  checked?: boolean;
  onSelect: () => void;
}

/** Item que abre um submenu (ex.: Idioma). Um nível só. */
export interface MenuSubmenu {
  id: string;
  label: string;
  /** Ícone na coluna da marca de seleção (ex.: globo no Idioma). */
  icon?: ReactNode;
  items: Array<MenuCommand | "separator">;
}

export type MenuEntry = MenuCommand | MenuSubmenu | "separator";

export function isSubmenu(entry: MenuEntry): entry is MenuSubmenu {
  return entry !== "separator" && "items" in entry;
}

export interface MenuDefinition {
  id: string;
  label: string;
  items: MenuEntry[];
}
