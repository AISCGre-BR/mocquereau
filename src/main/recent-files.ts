// src/main/recent-files.ts
// Pure helpers for the recent-files list stored in app-state.json.
import type { RecentEntry, RecentMeta } from "../shared/recent";

export type { RecentEntry, RecentMeta, RecentSourceMeta } from "../shared/recent";

export const MAX_RECENT = 8;
const MAX_TEXT = 500, MAX_THUMB = 300_000, MAX_SOURCES = 50;
const str = (v: unknown, max = MAX_TEXT) => (typeof v === "string" ? v.slice(0, max) : null);

export function sanitizeRecentMeta(v: unknown): RecentMeta | null {
  if (typeof v !== "object" || v === null) return null;
  const m = v as Record<string, unknown>;
  const title = str(m.title), author = str(m.author), updatedAt = str(m.updatedAt, 40);
  if (title === null || author === null || updatedAt === null || !Array.isArray(m.sources)) return null;
  const sources = m.sources.slice(0, MAX_SOURCES).flatMap((s) => {
    if (typeof s !== "object" || s === null) return [];
    const siglum = str((s as Record<string, unknown>).siglum);
    const p = (s as Record<string, unknown>).progress;
    if (siglum === null || typeof p !== "number" || !Number.isFinite(p)) return [];
    return [{ siglum, progress: Math.min(1, Math.max(0, p)) }];
  });
  const out: RecentMeta = { title, author, updatedAt, sources };
  if (typeof m.thumb === "string" && m.thumb.startsWith("data:image/jpeg;base64,") && m.thumb.length <= MAX_THUMB) out.thumb = m.thumb;
  return out;
}

export function migrateRecentState(raw: unknown): RecentEntry[] {
  if (typeof raw !== "object" || raw === null) return [];
  const r = raw as Record<string, unknown>;
  if (Array.isArray(r.recent)) {
    return r.recent.flatMap((e) => {
      if (typeof e !== "object" || e === null || typeof (e as RecentEntry).path !== "string" || !(e as RecentEntry).path) return [];
      const meta = sanitizeRecentMeta((e as RecentEntry).meta);
      return [meta ? { path: (e as RecentEntry).path, meta } : { path: (e as RecentEntry).path }];
    }).slice(0, MAX_RECENT);
  }
  if (Array.isArray(r.recentFiles)) {
    return r.recentFiles.filter((p): p is string => typeof p === "string" && p.length > 0).slice(0, MAX_RECENT).map((path) => ({ path }));
  }
  return [];
}

export function withRecentEntry(list: RecentEntry[], path: unknown): RecentEntry[] {
  if (typeof path !== "string" || !path) return list;
  const existing = list.find((e) => e.path === path);
  return [existing ?? { path }, ...list.filter((e) => e.path !== path)].slice(0, MAX_RECENT);
}

export function replaceRecentEntry(list: RecentEntry[], oldPath: string, newPath: string): RecentEntry[] {
  const meta = list.find((e) => e.path === oldPath)?.meta;
  const rest = list.filter((e) => e.path !== oldPath && e.path !== newPath);
  return [meta ? { path: newPath, meta } : { path: newPath }, ...rest].slice(0, MAX_RECENT);
}

export function setRecentMeta(list: RecentEntry[], path: unknown, meta: unknown): RecentEntry[] {
  const clean = sanitizeRecentMeta(meta);
  if (!clean || typeof path !== "string" || !list.some((e) => e.path === path)) return list;
  return list.map((e) => (e.path === path ? { path, meta: clean } : e));
}
