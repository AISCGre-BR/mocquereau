import type { KeyboardEvent } from "react";

/**
 * Keys a text field consumes; stopped so the Recortes window shortcuts don't also run.
 * Escape is not one of them: a field stops it only when it closes something of its own
 * (a list, a form), so otherwise it reaches the popover, which closes.
 */
export function ownsKey(e: KeyboardEvent): boolean {
  if (e.ctrlKey || e.metaKey) return false;
  return ["Backspace", "Delete", "Enter", "ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(e.key);
}

/** Ctrl+Enter (Cmd+Enter on macOS): go to the next syllable. */
export function isCtrlEnter(e: KeyboardEvent): boolean {
  return e.key === "Enter" && (e.ctrlKey || e.metaKey);
}

/** Text handlers for plain inputs: stop the keys the field owns. */
export function stopOwnedKeys(e: KeyboardEvent) {
  if (ownsKey(e)) e.stopPropagation();
}
