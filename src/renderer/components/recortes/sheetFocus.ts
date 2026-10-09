// src/renderer/components/recortes/sheetFocus.ts
//
// The Recortes editor keys (Enter/Tab/Delete, S6) are window shortcuts that
// stand aside when focus is on a shell control (a toolbar button, the source
// tree). After a mouse action on those controls focus would stay there and the
// keys would go dead (Enter would click Sugerir again): such actions hand focus
// to the sheet, a tabIndex=-1 container around the canvas.

const SHEET = "[data-recortes-sheet]";

export function focusSheet(): void {
  document.querySelector<HTMLElement>(SHEET)?.focus({ preventScroll: true });
}

/**
 * Hands focus to the sheet when it is stranded where the editor keys do not
 * reach (nothing, a toolbar button, the tree, a strip handle) and no dialog or
 * menu owns the keys.
 */
export function focusSheetIfStranded(): void {
  if (document.querySelector("[role=dialog],[role=menu]")) return;
  const el = document.activeElement;
  if (!el || el === document.body || el.closest("[role=toolbar],[role=tree],[role=slider]")) focusSheet();
}
