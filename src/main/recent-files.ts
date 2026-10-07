// src/main/recent-files.ts
// Pure helpers for the recent-files list stored in app-state.json.
export const MAX_RECENT = 8;

export function withRecent(list: string[], path: unknown): string[] {
  if (typeof path !== "string" || path.length === 0) return list;
  return [path, ...list.filter((p) => p !== path)].slice(0, MAX_RECENT);
}

export function replaceRecent(list: string[], oldPath: string, newPath: string): string[] {
  return withRecent(list.filter((p) => p !== oldPath), newPath);
}
