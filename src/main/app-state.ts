// src/main/app-state.ts
// Persistent app state (recent files, first-run tutorial flag) stored as
// JSON in the Electron userData directory, written atomically.

import { app, ipcMain } from 'electron';
import { readFile, mkdir } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { existsSync } from 'node:fs';
import { writeFileAtomic } from './atomic-write';
import { migrateRecentState, replaceRecentEntry, setRecentMeta, withRecentEntry } from './recent-files';
import type { RecentEntry } from '../shared/recent';

interface AppState {
  recent: RecentEntry[];
  tutorialSeen: boolean;
}

const DEFAULT_STATE: AppState = {
  recent: [],
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
    return {
      recent: migrateRecentState(parsed),
      tutorialSeen: typeof parsed?.tutorialSeen === 'boolean' ? parsed.tutorialSeen : DEFAULT_STATE.tutorialSeen,
    };
  } catch {
    return { ...DEFAULT_STATE };
  }
}

async function writeState(state: AppState): Promise<void> {
  const path = getStatePath();
  await mkdir(dirname(path), { recursive: true });
  await writeFileAtomic(path, JSON.stringify(state, null, 2));
}

/**
 * Todas as mutações (ler-modificar-gravar) passam por esta cadeia, para que
 * handlers concorrentes não percam entradas uns dos outros.
 */
let queue: Promise<unknown> = Promise.resolve();
function mutate(fn: (state: AppState) => boolean | void | Promise<boolean | void>): Promise<void> {
  const run = queue.then(async () => {
    const state = await readState();
    if ((await fn(state)) === false) return;
    await writeState(state);
  });
  queue = run.catch(() => {});
  return run;
}

/** Adds a path to the top of the recent list; ignores null/empty (legacy opens). */
export async function addRecentFile(filePath: unknown): Promise<void> {
  await mutate((state) => {
    const next = withRecentEntry(state.recent, filePath);
    if (next === state.recent) return false;
    state.recent = next;
  });
}

/** Legacy -> package migration: the new file takes the legacy file's place. */
export async function replaceRecentFile(oldPath: string, newPath: string): Promise<void> {
  await mutate((state) => {
    state.recent = replaceRecentEntry(state.recent, oldPath, newPath);
  });
}

export function registerAppStateHandlers(): void {
  ipcMain.handle('app:get-recent', async (): Promise<RecentEntry[]> => {
    const state = await readState();
    // Filter out paths that no longer exist on disk
    return state.recent.filter((e) => existsSync(e.path));
  });

  ipcMain.handle('app:update-recent-meta', async (_event, filePath: unknown, meta: unknown) => {
    await mutate((state) => {
      const next = setRecentMeta(state.recent, filePath, meta);
      if (next === state.recent) return false;
      state.recent = next;
    });
  });

  ipcMain.handle('app:add-recent-file', async (_event, filePath: unknown) => {
    await addRecentFile(filePath);
  });

  ipcMain.handle('app:clear-recent-files', async () => {
    await mutate((state) => {
      state.recent = [];
    });
  });

  ipcMain.handle('app:get-tutorial-seen', async (): Promise<boolean> => {
    const state = await readState();
    return state.tutorialSeen;
  });

  ipcMain.handle('app:set-tutorial-seen', async (_event, seen: boolean) => {
    await mutate((state) => {
      state.tutorialSeen = !!seen;
    });
  });

  ipcMain.handle('app:get-version', async (): Promise<string> => {
    return app.getVersion();
  });
}
