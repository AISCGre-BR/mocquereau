// src/renderer/commands/accelerator.ts
//
// Electron accelerator strings <-> KeyboardEvent matching for the in-window
// menubar (Win/Linux). Letters follow the typed character (AZERTY-safe) and
// fall back to the physical key code for non-Latin layouts.
import type { Platform } from "./types";

export interface ParsedAccelerator {
  key: string;
  ctrl: boolean;
  meta: boolean;
  alt: boolean;
  shift: boolean;
}

export interface KeyLike {
  key: string;
  code?: string;
  ctrlKey: boolean;
  metaKey: boolean;
  altKey: boolean;
  shiftKey: boolean;
}

type Modifier = "cmdOrCtrl" | "ctrl" | "meta" | "alt" | "shift";

const MODIFIERS: Record<string, Modifier> = {
  commandorcontrol: "cmdOrCtrl",
  cmdorctrl: "cmdOrCtrl",
  command: "meta",
  cmd: "meta",
  super: "meta",
  meta: "meta",
  control: "ctrl",
  ctrl: "ctrl",
  alt: "alt",
  option: "alt",
  shift: "shift",
};

const KEY_ALIASES: Record<string, string> = {
  up: "ArrowUp",
  down: "ArrowDown",
  left: "ArrowLeft",
  right: "ArrowRight",
  esc: "Escape",
  escape: "Escape",
  return: "Enter",
  enter: "Enter",
  tab: "Tab",
  space: "Space",
  backspace: "Backspace",
  delete: "Delete",
  del: "Delete",
  insert: "Insert",
  home: "Home",
  end: "End",
  pageup: "PageUp",
  pagedown: "PageDown",
  plus: "+",
};

function normalizeAcceleratorKey(raw: string): string {
  const alias = KEY_ALIASES[raw.toLowerCase()];
  if (alias) return alias;
  if (/^f([1-9]|1\d|2[0-4])$/i.test(raw)) return raw.toUpperCase();
  if (raw.length === 1) return raw.toUpperCase();
  throw new Error(`Invalid accelerator key "${raw}"`);
}

export function parseAccelerator(accelerator: string, platform: Platform): ParsedAccelerator {
  const parts = accelerator.split("+").map((p) => p.trim());
  const rawKey = parts.pop();
  if (!rawKey) throw new Error(`Invalid accelerator "${accelerator}"`);
  const out: ParsedAccelerator = { key: normalizeAcceleratorKey(rawKey), ctrl: false, meta: false, alt: false, shift: false };
  for (const part of parts) {
    const mod = MODIFIERS[part.toLowerCase()];
    if (!mod) throw new Error(`Invalid accelerator modifier "${part}" in "${accelerator}"`);
    if (mod === "cmdOrCtrl") {
      if (platform === "darwin") out.meta = true;
      else out.ctrl = true;
    } else {
      out[mod] = true;
    }
  }
  return out;
}

export function normalizeEventKey(e: KeyLike): string {
  if (e.key === " ") return "Space";
  if (e.key.length === 1 && e.key >= "!" && e.key <= "~") return e.key.toUpperCase();
  if (e.code && /^Key[A-Z]$/.test(e.code)) return e.code.slice(3);
  if (e.code && /^Digit[0-9]$/.test(e.code)) return e.code.slice(5);
  return e.key;
}

export function matchAccelerator(accelerator: string, e: KeyLike, platform: Platform): boolean {
  const p = parseAccelerator(accelerator, platform);
  return (
    p.ctrl === e.ctrlKey &&
    p.meta === e.metaKey &&
    p.alt === e.altKey &&
    p.shift === e.shiftKey &&
    p.key === normalizeEventKey(e)
  );
}
