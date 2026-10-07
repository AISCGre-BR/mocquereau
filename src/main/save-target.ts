// src/main/save-target.ts
//
// Where does a save go? Pure decision (spec D8): only .mocquereau paths are
// written directly; anything else (no path, legacy .mocquereau.json) opens
// Save As next to the legacy file, and the chosen name always ends in .mocquereau.
import { join } from "node:path";

export const PACKAGE_EXT = ".mocquereau";

export interface LegacyOrigin {
  path: string;
  createdAt: string;
}

export type SaveDecision =
  | { kind: "direct"; path: string }
  | { kind: "dialog"; suggested: string; legacyPath: string | null };

export function isPackagePath(p: string): boolean {
  return p.toLowerCase().endsWith(PACKAGE_EXT);
}

export function ensurePackageExtension(p: string): string {
  if (isPackagePath(p)) return p;
  const stripped = p.replace(/\.mocquereau\.json$/i, "").replace(/\.json$/i, "");
  return `${stripped}${PACKAGE_EXT}`;
}

export function sanitizeFileName(name: string): string {
  return name.replace(/[\\/:*?"<>|\u0000-\u001f]/g, "_").trim();
}

export function decideSave(opts: {
  existingPath?: string | null;
  forceDialog?: boolean;
  legacy: LegacyOrigin | null;
  project: { meta: { title: string; createdAt: string } };
  defaultDir: string;
}): SaveDecision {
  const { existingPath, forceDialog, legacy, project, defaultDir } = opts;
  if (existingPath && isPackagePath(existingPath)) {
    return forceDialog
      ? { kind: "dialog", suggested: existingPath, legacyPath: null }
      : { kind: "direct", path: existingPath };
  }
  const legacyPath = existingPath
    ? existingPath
    : legacy && legacy.createdAt === project.meta.createdAt
      ? legacy.path
      : null;
  if (legacyPath) return { kind: "dialog", suggested: ensurePackageExtension(legacyPath), legacyPath };
  const name = sanitizeFileName(project.meta.title) || "projeto";
  return { kind: "dialog", suggested: join(defaultDir, `${name}${PACKAGE_EXT}`), legacyPath: null };
}
