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
