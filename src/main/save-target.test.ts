import { describe, expect, it } from "vitest";
import { join } from "node:path";
import {
  decideSave,
  ensurePackageExtension,
  isPackagePath,
  needsOverwriteConfirm,
  sanitizeFileName,
  saveDialogOptions,
} from "./save-target";

const project = { meta: { title: "Puer natus", createdAt: "2026-01-01T00:00:00.000Z" } };
const DOCS = join("home", "user", "Documents");

describe("ensurePackageExtension", () => {
  it("forces .mocquereau and never keeps a legacy extension", () => {
    expect(ensurePackageExtension("/a/Puer.mocquereau.json")).toBe("/a/Puer.mocquereau");
    expect(ensurePackageExtension("/a/Puer.json")).toBe("/a/Puer.mocquereau");
    expect(ensurePackageExtension("/a/Puer")).toBe("/a/Puer.mocquereau");
    expect(ensurePackageExtension("/a/Puer.MOCQUEREAU")).toBe("/a/Puer.MOCQUEREAU");
    expect(ensurePackageExtension("/a/notas.txt")).toBe("/a/notas.txt.mocquereau");
  });

  it("isPackagePath is case-insensitive and rejects legacy files", () => {
    expect(isPackagePath("x.Mocquereau")).toBe(true);
    expect(isPackagePath("x.mocquereau.json")).toBe(false);
  });

  it("sanitizes titles for file names", () => {
    expect(sanitizeFileName(' Gradual: "Puer"/natus? ')).toBe('Gradual_ _Puer__natus_');
  });
});

describe("decideSave", () => {
  it("writes directly to an existing package path", () => {
    expect(decideSave({ existingPath: "/a/p.mocquereau", legacy: null, project, defaultDir: DOCS }))
      .toEqual({ kind: "direct", path: "/a/p.mocquereau" });
  });

  it("Save As on a package suggests the same path", () => {
    expect(decideSave({ existingPath: "/a/p.mocquereau", forceDialog: true, legacy: null, project, defaultDir: DOCS }))
      .toEqual({ kind: "dialog", suggested: "/a/p.mocquereau", legacyPath: null });
  });

  it("never writes to a legacy path: dialog next to it with .mocquereau", () => {
    expect(decideSave({ existingPath: "/a/Puer natus.mocquereau.json", legacy: null, project, defaultDir: DOCS }))
      .toEqual({ kind: "dialog", suggested: "/a/Puer natus.mocquereau", legacyPath: "/a/Puer natus.mocquereau.json" });
  });

  it("uses the remembered legacy origin when the project is the same one", () => {
    const legacy = { path: "/a/Old.mocquereau.json", createdAt: project.meta.createdAt };
    expect(decideSave({ existingPath: undefined, legacy, project, defaultDir: DOCS }))
      .toEqual({ kind: "dialog", suggested: "/a/Old.mocquereau", legacyPath: "/a/Old.mocquereau.json" });
  });

  it("ignores the legacy origin for a different (new) project", () => {
    const legacy = { path: "/a/Old.mocquereau.json", createdAt: "2020-01-01T00:00:00.000Z" };
    expect(decideSave({ existingPath: undefined, legacy, project, defaultDir: DOCS }))
      .toEqual({ kind: "dialog", suggested: join(DOCS, "Puer natus.mocquereau"), legacyPath: null });
  });

  it("falls back to a default name for an empty title", () => {
    const untitled = { meta: { title: "  ", createdAt: "x" } };
    expect(decideSave({ existingPath: null, legacy: null, project: untitled, defaultDir: DOCS }))
      .toEqual({ kind: "dialog", suggested: join(DOCS, "projeto.mocquereau"), legacyPath: null });
  });
});

describe("Save As overwrite protection (B1)", () => {
  it("asks the OS dialog to confirm overwrites and allow new folders", () => {
    const opts = saveDialogOptions("/a/p.mocquereau", { title: "Salvar", filterName: "Projeto" });
    expect(opts.properties).toEqual(expect.arrayContaining(["showOverwriteConfirmation", "createDirectory"]));
    expect(opts.defaultPath).toBe("/a/p.mocquereau");
    expect(opts.filters).toEqual([{ name: "Projeto", extensions: ["mocquereau"] }]);
  });

  it("needs our own confirm only when the extension was changed AND the new target exists", () => {
    const exists = (p: string) => p === "/a/Puer.mocquereau";
    // The OS dialog already confirmed /a/Puer.mocquereau itself.
    expect(needsOverwriteConfirm("/a/Puer.mocquereau", "/a/Puer.mocquereau", exists)).toBe(false);
    // User typed "Puer" (or picked the legacy .json): we write somewhere the OS never asked about.
    expect(needsOverwriteConfirm("/a/Puer", "/a/Puer.mocquereau", exists)).toBe(true);
    expect(needsOverwriteConfirm("/a/Puer.mocquereau.json", "/a/Puer.mocquereau", exists)).toBe(true);
    // Changed, but nothing there to overwrite.
    expect(needsOverwriteConfirm("/a/Novo", "/a/Novo.mocquereau", exists)).toBe(false);
  });
});
