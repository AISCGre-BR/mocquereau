export interface MenuCommand {
  id: string;
  label: string;
  /** Formato "Ctrl+Shift+S"; aparece no menu e vira atalho de teclado. */
  accelerator?: string;
  disabled?: boolean;
  /** Definido = item de alternância. */
  checked?: boolean;
  onSelect: () => void;
}

export type MenuEntry = MenuCommand | "separator";

export interface MenuDefinition {
  id: string;
  label: string;
  items: MenuEntry[];
}
