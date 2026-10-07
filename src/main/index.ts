import { app, BrowserWindow, ipcMain, shell, dialog } from "electron";
import { join } from "node:path";
import { Conf } from "electron-conf/main";
import { registerProjectHandlers } from './project-io';
import { registerImageHandlers } from './iiif-fetch';
import { registerDocxExportHandler } from './docx-export';
import { registerAppStateHandlers } from './app-state';
import { SessionStore } from './session-store';
import { registerSessionImageHandlers } from './session-ipc';

interface UserPrefs {
  language: string;
  theme: string;
}

const userPrefs = new Conf<UserPrefs>({
  name: 'user-prefs',
  defaults: { language: 'pt-BR', theme: 'light' },
});

// Track dirty state for close confirmation. Set via IPC from renderer.
let projectIsDirty = false;
// User already confirmed discard? Skip the next close prompt to avoid loops.
let bypassCloseConfirm = false;

// Working session (spec D2): images of the open document live on disk here.
const SESSION_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
let session: SessionStore | null = null;

function getSession(): SessionStore {
  if (!session) throw new Error('working session not initialised');
  return session;
}

function createWindow(): void {
  const win = new BrowserWindow({
    width: 1600,
    height: 900,
    icon: join(__dirname, "../../resources/icon.png"),
    webPreferences: {
      preload: join(__dirname, "../preload/index.js"),
      sandbox: true,
      nodeIntegration: false,
      contextIsolation: true,
    },
  });

  // LPUI-01 fix: lock page zoom so Ctrl+wheel / trackpad pinch never zoom
  // the whole app (the TablePreview has its own discrete zoom controls).
  win.webContents.setVisualZoomLevelLimits(1, 1);
  win.webContents.setZoomFactor(1);
  win.webContents.on('zoom-changed', () => {
    win.webContents.setZoomFactor(1);
  });

  // Intercept close to prompt when there are unsaved changes
  win.on('close', (e) => {
    if (projectIsDirty && !bypassCloseConfirm) {
      e.preventDefault();
      const choice = dialog.showMessageBoxSync(win, {
        type: 'warning',
        buttons: ['Cancelar', 'Descartar e sair'],
        defaultId: 0,
        cancelId: 0,
        title: 'Alterações não salvas',
        message: 'Há alterações não salvas no projeto.',
        detail: 'Se sair agora, as alterações não salvas serão perdidas. Use Ctrl+S para salvar antes.',
      });
      if (choice === 1) {
        bypassCloseConfirm = true;
        win.close();
      }
    }
  });

  if (process.env.ELECTRON_RENDERER_URL) {
    win.loadURL(process.env.ELECTRON_RENDERER_URL);
  } else {
    win.loadFile(join(__dirname, "../renderer/index.html"));
  }
}


function registerSystemHandlers(): void {
  const ALLOWED_PROTOCOLS = ["https:", "http:"];

  ipcMain.handle("shell:open-external", async (_event, url: string) => {
    try {
      const parsed = new URL(url);
      if (ALLOWED_PROTOCOLS.includes(parsed.protocol)) {
        await shell.openExternal(url);
      }
    } catch {
      // Invalid URL — ignore
    }
  });

  // Track renderer's dirty state for the close-confirmation dialog
  ipcMain.handle("project:set-dirty", async (_event, isDirty: boolean) => {
    projectIsDirty = !!isDirty;
  });

  ipcMain.handle("settings:get-language", async () => userPrefs.get('language'));
  ipcMain.handle("settings:set-language", async (_event, lang: string) => {
    userPrefs.set('language', lang);
    return lang;
  });
  ipcMain.handle("settings:get-theme", async () => userPrefs.get('theme'));
  ipcMain.handle("settings:set-theme", async (_event, theme: string) => {
    userPrefs.set('theme', theme);
    return true;
  });
}

app.whenReady().then(async () => {
  const sessionsRoot = join(app.getPath('userData'), 'sessions');
  await SessionStore.sweepStale(sessionsRoot, SESSION_MAX_AGE_MS);
  session = await SessionStore.create(sessionsRoot);

  registerProjectHandlers({
    getStore: getSession,
    onSaveStarted: () => undefined,
    onSaveFinished: () => undefined,
  });
  registerDocxExportHandler();
  registerImageHandlers();
  registerSessionImageHandlers(getSession);
  registerSystemHandlers();
  registerAppStateHandlers();
  createWindow();
});

app.on('will-quit', () => {
  session?.disposeSync();
  session = null;
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
