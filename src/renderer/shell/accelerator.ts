// Atalhos no formato "Ctrl+Shift+S". "Ctrl" casa com Ctrl (Windows/Linux) e Cmd (macOS).

export type AcceleratorEvent = Pick<KeyboardEvent, "key" | "ctrlKey" | "metaKey" | "shiftKey" | "altKey">;

export function parseAccelerator(accel: string): { ctrl: boolean; shift: boolean; alt: boolean; key: string } {
  const parts = accel.split("+");
  const key = (parts.pop() ?? "").toLowerCase();
  const mods = new Set(parts.map((p) => p.toLowerCase()));
  return { ctrl: mods.has("ctrl"), shift: mods.has("shift"), alt: mods.has("alt"), key };
}

export function matchAccelerator(accel: string, e: AcceleratorEvent): boolean {
  const a = parseAccelerator(accel);
  return (
    a.ctrl === (e.ctrlKey || e.metaKey) &&
    a.shift === e.shiftKey &&
    a.alt === e.altKey &&
    e.key.toLowerCase() === a.key
  );
}

export function formatAccelerator(accel: string, platform: string): string {
  if (platform !== "darwin") return accel;
  return accel.replace(/Ctrl\+/g, "⌘").replace(/Shift\+/g, "⇧").replace(/Alt\+/g, "⌥");
}
