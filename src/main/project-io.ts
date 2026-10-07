// src/main/project-io.ts
//
// Project IPC on top of document-io. Channel names and payloads are the ones
// App.tsx and ProjectSetup.tsx already use (wave A2 keeps the UI untouched):
//   project:save(project, existingPath?)  -> { filePath } | null
//   project:save-as(project, currentPath?) -> { filePath } | null
//   project:open()                        -> { project, filePath | null } | null
//   project:open-by-path(path)            -> { project, filePath | null } | null
// filePath null means "opened from a legacy .mocquereau.json": no writable path,
// so autosave stays off and the next save becomes Save As (spec D8).
import { app, BrowserWindow, dialog, ipcMain } from 'electron';
import { existsSync } from 'node:fs';
import { basename } from 'node:path';
import { readFile } from 'node:fs/promises';
import type { SessionProject } from '@shared/project-schema';
import { DocumentError, openDocument, saveDocument } from './document-io';
import {
  decideSave,
  ensurePackageExtension,
  needsOverwriteConfirm,
  saveDialogOptions,
  type LegacyOrigin,
} from './save-target';
import { addRecentFile, replaceRecentFile } from './app-state';
import { t } from './i18n';
import type { SessionStore } from './session-store';
import type { SaveQueue } from './save-queue';

export interface ProjectIoHooks {
  getStore(): SessionStore;
  /** Serialises writes per target; also what the quit path waits on (B3). */
  saveQueue: SaveQueue;
  onSaveStarted(token: number): void;
  onSaveFinished(token: number, ok: boolean): void;
}

type OpenResult = { project: SessionProject; filePath: string | null };

/** Legacy file the current document came from. It is never written to. */
let legacyOrigin: LegacyOrigin | null = null;

async function showError(message: string): Promise<void> {
  const win = BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0];
  const options = { type: 'error' as const, title: 'Mocquereau', message };
  if (win) await dialog.showMessageBox(win, options);
  else await dialog.showMessageBox(options);
}

async function showOpenWarning(count: number, warnings: string[]): Promise<void> {
  const win = BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0];
  const technical = warnings.slice(0, 8).join('\n') + (warnings.length > 8 ? '\n…' : '');
  const options = {
    type: 'warning' as const,
    title: 'Mocquereau',
    message: t('main.openWarning.missingImages', { count }),
    detail: technical ? `${t('main.openWarning.detail')}\n\n${technical}` : t('main.openWarning.detail'),
  };
  if (win) await dialog.showMessageBox(win, options);
  else await dialog.showMessageBox(options);
}

/** B1: the OS never confirmed this path (we changed its extension). */
async function confirmOverwrite(target: string): Promise<boolean> {
  const win = BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0];
  const options = {
    type: 'warning' as const,
    buttons: [t('main.overwrite.replace'), t('main.overwrite.cancel')],
    defaultId: 1,
    cancelId: 1,
    noLink: true,
    title: 'Mocquereau',
    message: t('main.overwrite.message', { name: basename(target) }),
    detail: t('main.overwrite.detail'),
  };
  const { response } = win ? await dialog.showMessageBox(win, options) : await dialog.showMessageBox(options);
  return response === 0;
}

function openErrorMessage(err: unknown): string {
  if (err instanceof DocumentError && err.code === 'newer') {
    return t('main.error.newerVersion', { version: err.info.version ?? '?' });
  }
  return t('main.error.invalidFile');
}

function saveErrorMessage(err: unknown, target: string): string {
  if (err instanceof DocumentError && err.code === 'missing-images') {
    return t('main.error.missingImages', { count: err.info.count ?? 0 });
  }
  return t('main.error.saveFailed', { path: target, reason: err instanceof Error ? err.message : String(err) });
}

async function openPath(filePath: string, hooks: ProjectIoHooks): Promise<OpenResult | null> {
  try {
    const doc = await openDocument(filePath, hooks.getStore());
    if (doc.warnings.length > 0) console.warn('[project-io] open warnings', filePath, doc.warnings);
    // S4/N1: images that could not be read open as placeholders; tell the user, not only the console.
    if (doc.missingImages > 0) await showOpenWarning(doc.missingImages, doc.warnings);
    if (doc.ambiguousLines.length > 0) {
      console.info('[project-io] legacy lines with ambiguous box frame, v0.0.6 reading kept (R3)', doc.ambiguousLines);
    }
    await addRecentFile(filePath);
    if (doc.format === 'legacy') {
      legacyOrigin = { path: filePath, createdAt: doc.project.meta.createdAt };
      return { project: doc.project, filePath: null };
    }
    legacyOrigin = null;
    return { project: doc.project, filePath };
  } catch (err) {
    console.error('[project-io] open failed', filePath, err);
    await showError(openErrorMessage(err));
    return null;
  }
}

async function save(
  project: SessionProject,
  existingPath: string | undefined,
  forceDialog: boolean,
  hooks: ProjectIoHooks,
): Promise<{ filePath: string } | null> {
  const token = hooks.saveQueue.nextToken();
  hooks.onSaveStarted(token);
  let ok = false;
  let target = existingPath ?? '';
  try {
    const decision = decideSave({
      existingPath,
      forceDialog,
      legacy: legacyOrigin,
      project,
      defaultDir: app.getPath('documents'),
    });
    if (decision.kind === 'direct') {
      target = decision.path;
    } else {
      const { canceled, filePath } = await dialog.showSaveDialog(
        saveDialogOptions(decision.suggested, {
          title: t('main.dialog.saveProject'),
          filterName: t('main.filter.project'),
        }),
      );
      if (canceled || !filePath) return null;
      target = ensurePackageExtension(filePath);
      if (needsOverwriteConfirm(filePath, target, existsSync) && !(await confirmOverwrite(target))) return null;
    }
    const finalTarget = target;
    await hooks.saveQueue.run(finalTarget, async () => {
      await saveDocument(project, finalTarget, hooks.getStore(), app.getVersion());
      if (decision.kind === 'dialog' && decision.legacyPath) {
        await replaceRecentFile(decision.legacyPath, finalTarget);
        legacyOrigin = null;
      } else {
        await addRecentFile(finalTarget);
      }
    });
    ok = true;
    return { filePath: target };
  } catch (err) {
    console.error('[project-io] save failed', target, err);
    await showError(saveErrorMessage(err, target));
    return null;
  } finally {
    hooks.onSaveFinished(token, ok);
  }
}

export function registerProjectHandlers(hooks: ProjectIoHooks): void {
  ipcMain.handle('project:save', (_event, project: SessionProject, existingPath?: string) =>
    save(project, existingPath || undefined, false, hooks),
  );

  ipcMain.handle('project:save-as', (_event, project: SessionProject, currentPath?: string) =>
    save(project, currentPath || undefined, true, hooks),
  );

  ipcMain.handle('project:open', async () => {
    const { canceled, filePaths } = await dialog.showOpenDialog({
      title: t('main.dialog.openProject'),
      filters: [{ name: t('main.filter.project'), extensions: ['mocquereau', 'json'] }],
      properties: ['openFile'],
    });
    if (canceled || !filePaths[0]) return null;
    return openPath(filePaths[0], hooks);
  });

  // Recent files list. Missing file -> null (ProjectSetup shows its own message).
  ipcMain.handle('project:open-by-path', async (_event, filePath: unknown) => {
    if (typeof filePath !== 'string' || !existsSync(filePath)) return null;
    return openPath(filePath, hooks);
  });

  ipcMain.handle('project:import-gueranger', async () => {
    const { canceled, filePaths } = await dialog.showOpenDialog({
      title: t('main.dialog.importGueranger'),
      filters: [{ name: t('main.filter.gueranger'), extensions: ['json'] }],
      properties: ['openFile'],
    });
    if (canceled || !filePaths[0]) return null;
    const raw = await readFile(filePaths[0], 'utf-8');
    return JSON.parse(raw);
  });
}
