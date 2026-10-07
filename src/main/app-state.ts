// src/main/app-state.ts
// Persistent app state (recent files, first-run tutorial flag) stored as
// JSON in the Electron userData directory, written atomically.

import { app, ipcMain } from 'electron';
import { readFile, mkdir } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { existsSync } from 'node:fs';
import { writeFileAtomic } from './atomic-write';
import { replaceRecent, withRecent } from './recent-files';

interface AppState {
  recentFiles: string[];
  tutorialSeen: boolean;
}

const DEFAULT_STATE: AppState = {
  recentFiles: [],
  tutorialSeen: false,
};

function getStatePath(): string {
  return join(app.getPath('userData'), 'app-state.json');
}

async function readState(): Promise<AppState> {
  const path = getStatePath();
  if (!existsSync(path)) return { ...DEFAULT_STATE };
  try {
    const raw = await readFile(path, 'utf-8');
    const parsed = JSON.parse(raw);
    return { ...DEFAULT_STATE, ...parsed };
  } catch {
    return { ...DEFAULT_STATE };
  }
}

async function writeState(state: AppState): Promise<void> {
  const path = getStatePath();
  await mkdir(dirname(path), { recursive: true });
  await writeFileAtomic(path, JSON.stringify(state, null, 2));
}

/** Adds a path to the top of the recent list; ignores null/empty (legacy opens). */
export async function addRecentFile(filePath: unknown): Promise<void> {
  const state = await readState();
  const next = withRecent(state.recentFiles, filePath);
  if (next === state.recentFiles) return;
  state.recentFiles = next;
  await writeState(state);
}

/** Legacy -> package migration: the new file takes the legacy file's place. */
export async function replaceRecentFile(oldPath: string, newPath: string): Promise<void> {
  const state = await readState();
  state.recentFiles = replaceRecent(state.recentFiles, oldPath, newPath);
  await writeState(state);
}

export function registerAppStateHandlers(): void {
  ipcMain.handle('app:get-recent-files', async (): Promise<string[]> => {
    const state = await readState();
    // Filter out paths that no longer exist on disk
    return state.recentFiles.filter((p) => existsSync(p));
  });

  ipcMain.handle('app:add-recent-file', async (_event, filePath: unknown) => {
    await addRecentFile(filePath);
  });

  ipcMain.handle('app:clear-recent-files', async () => {
    const state = await readState();
    state.recentFiles = [];
    await writeState(state);
  });

  ipcMain.handle('app:get-tutorial-seen', async (): Promise<boolean> => {
    const state = await readState();
    return state.tutorialSeen;
  });

  ipcMain.handle('app:set-tutorial-seen', async (_event, seen: boolean) => {
    const state = await readState();
    state.tutorialSeen = !!seen;
    await writeState(state);
  });

  ipcMain.handle('app:get-version', async (): Promise<string> => {
    return app.getVersion();
  });
}
