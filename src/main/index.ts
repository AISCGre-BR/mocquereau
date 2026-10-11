import { app, BrowserWindow, ipcMain, shell, dialog, Menu, nativeTheme } from "electron";
import { join } from "node:path";
import { Conf } from "electron-conf/main";
import { registerProjectHandlers } from './project-io';
import { registerImageHandlers } from './iiif-fetch';
import { registerDocxExportHandler } from './docx-export';
import { registerAppStateHandlers } from './app-state';
import { normalizeTheme, overlayFor, shouldUseNativeFrame, windowChromeOptions, type ThemePreference } from './window-chrome';
import { SessionStore } from './session-store';
import { registerSessionImageHandlers } from './session-ipc';
import { initMainI18n, setMainLanguage, t } from './i18n';
import { CloseFlow, SaveThenClose, closeChoiceFromResponse, createQuitGuard } from './close-coordinator';
import { SaveQueue } from './save-queue';
import { SUGGESTED_CLASSIFICATION, cloneClassification, type Classification } from '../shared/classification';
import { readClassification } from '../shared/validate';
import { isSuggestionsMode, readSuggestionsMode, type SuggestionsMode } from '../shared/suggestions-mode';

interface UserPrefs {
  language: string;
  theme: ThemePreference;
  classification?: Classification;
  /** M1: how the Recortes view suggests neumes. */
  suggestionsMode?: SuggestionsMode;
  /** Old (C1): only read, then dropped on the first write of suggestionsMode. */
  suggestionsEnabled?: boolean;
}

const userPrefs = new Conf<UserPrefs>({
  name: 'user-prefs',
  defaults: { language: 'pt-BR', theme: 'system' },
});

// Barra de título nativa quando o overlay não é confiável (heurística do Linux
// em shouldUseNativeFrame) ou por MOCQUEREAU_NATIVE_FRAME=1 (=0 força o overlay).
const useNativeFrame = shouldUseNativeFrame(process.platform, process.env);

// Track dirty state for close confirmation. Set via IPC from renderer.
let projectIsDirty = false;
// Close/quit bookkeeping for the unsaved-changes prompt (N2).
const closeFlow = new CloseFlow();

// Working session (spec D2): images of the open document live on disk here.
const SESSION_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
let session: SessionStore | null = null;

function getSession(): SessionStore {
  if (!session) throw new Error('working session not initialised');
  return session;
}

// B3: per-target save serialisation; will-quit waits for it before deleting the session.
const saveQueue = new SaveQueue();

let mainWindow: BrowserWindow | null = null;
let closePromptOpen = false;

// "Save" in the close dialog: close once the renderer-driven save succeeds.
const saveThenClose = new SaveThenClose(
  () => {
    closeFlow.allowNextClose();
    mainWindow?.close();
  },
  5000,
  undefined,
  () => closeFlow.onCloseAborted(),
);

// Ask the renderer to save (it flushes pending edits first). Its project:save
// call reports back through onSaveStarted/onSaveFinished; a synthetic Ctrl+S
// would be swallowed by open dialogs or focused fields.
function requestRendererSave(win: BrowserWindow): void {
  win.webContents.send('app:request-save');
}

function refreshTitleBarOverlays(): void {
  if (process.platform === 'darwin' || useNativeFrame) return;
  const overlay = overlayFor(nativeTheme.shouldUseDarkColors);
  for (const win of BrowserWindow.getAllWindows()) {
    try {
      win.setTitleBarOverlay(overlay);
    } catch {
      // Plataforma sem overlay de título: nada a atualizar.
    }
  }
}

// scripts/smoke-worker.mjs: MOCQUEREAU_SMOKE=worker abre a janela oculta com ?smoke=worker, espera o
// renderer gravar SMOKE_OK/SMOKE_FAIL no titulo, imprime e sai (0/1). Sem a variavel, nada muda.
const smokeMode = process.env.MOCQUEREAU_SMOKE === 'worker';
const SMOKE_TIMEOUT_MS = 30_000;

function watchSmoke(win: BrowserWindow): void {
  let done = false;
  const finish = (line: string, code: number) => {
    if (done) return;
    done = true;
    process.stdout.write(`${line}\n`);
    app.exit(code);
  };
  const timer = setTimeout(() => finish('SMOKE_FAIL timeout', 1), SMOKE_TIMEOUT_MS);
  win.webContents.on('page-title-updated', (_e, title) => {
    if (!title.startsWith('SMOKE_')) return;
    clearTimeout(timer);
    finish(title, title.startsWith('SMOKE_OK') ? 0 : 1);
  });
  win.webContents.on('render-process-gone', (_e, d) => finish(`SMOKE_FAIL renderer gone (${d.reason})`, 1));
  win.webContents.on('did-fail-load', (_e, code, desc) => finish(`SMOKE_FAIL load ${code} ${desc}`, 1));
}

function createWindow(): void {
  const win = new BrowserWindow({
    width: 1600,
    show: !smokeMode,
    height: 900,
    icon: join(__dirname, "../../resources/icon.png"),
    ...windowChromeOptions(process.platform, nativeTheme.shouldUseDarkColors, useNativeFrame),
    webPreferences: {
      preload: join(__dirname, "../preload/index.js"),
      sandbox: true,
      nodeIntegration: false,
      contextIsolation: true,
    },
  });

  mainWindow = win;
  win.on('closed', () => {
    if (mainWindow === win) mainWindow = null;
    // N2: reset the one-shot bypass; finish a Cmd+Q the prompt was holding.
    if (closeFlow.onClosed() === 'quit') app.quit();
  });

  // LPUI-01 fix: lock page zoom so Ctrl+wheel / trackpad pinch never zoom
  // the whole app (the TablePreview has its own discrete zoom controls).
  win.webContents.setVisualZoomLevelLimits(1, 1);
  win.webContents.setZoomFactor(1);
  win.webContents.on('zoom-changed', () => {
    win.webContents.setZoomFactor(1);
  });

  // Sem menu nativo no Windows/Linux, os atalhos padrão de DevTools e reload somem;
  // em desenvolvimento eles voltam aqui.
  if (!app.isPackaged) {
    win.webContents.on('before-input-event', (event, input) => {
      if (input.type !== 'keyDown') return;
      const key = input.key.toLowerCase();
      if (input.key === 'F12' || (input.control && input.shift && key === 'i')) {
        win.webContents.toggleDevTools();
        event.preventDefault();
      } else if (input.control && !input.shift && key === 'r') {
        win.webContents.reload();
        event.preventDefault();
      }
    });
  }

  // Intercept close to prompt when there are unsaved changes (spec 6, wave A2 form).
  win.on('close', (e) => {
    if (!closeFlow.shouldPrompt(projectIsDirty)) return;
    e.preventDefault();
    if (closePromptOpen || saveThenClose.isArmed) return;
    closePromptOpen = true;
    void dialog
      .showMessageBox(win, {
        type: 'warning',
        buttons: [t('main.unsaved.save'), t('main.unsaved.discard'), t('main.unsaved.cancel')],
        defaultId: 0,
        cancelId: 2,
        noLink: true,
        title: t('main.unsaved.title'),
        message: t('main.unsaved.message'),
        detail: t('main.unsaved.detail'),
      })
      .then(({ response }) => {
        closePromptOpen = false;
        const choice = closeChoiceFromResponse(response);
        if (choice === 'discard') {
          closeFlow.allowNextClose();
          win.close();
        } else if (choice === 'save') {
          saveThenClose.arm();
          requestRendererSave(win);
        } else {
          closeFlow.onCloseAborted();
        }
      });
  });

  if (smokeMode) watchSmoke(win);
  if (process.env.ELECTRON_RENDERER_URL) {
    win.loadURL(process.env.ELECTRON_RENDERER_URL);
  } else {
    win.loadFile(join(__dirname, "../renderer/index.html"), smokeMode ? { query: { smoke: 'worker' } } : undefined);
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
  ipcMain.handle("settings:get-classification", async () =>
    readClassification(userPrefs.get('classification')) ?? cloneClassification(SUGGESTED_CLASSIFICATION));
  ipcMain.handle("settings:set-classification", async (_event, c: unknown) => {
    const valid = readClassification(c);
    if (valid) userPrefs.set('classification', valid);
  });
  ipcMain.handle("settings:set-language", async (_event, lang: string) => {
    userPrefs.set('language', lang);
    setMainLanguage(lang);
    return lang;
  });
  ipcMain.handle("settings:get-theme", async () => normalizeTheme(userPrefs.get('theme')));
  ipcMain.handle("settings:set-theme", async (_event, theme: unknown) => {
    const value = normalizeTheme(theme);
    userPrefs.set('theme', value);
    nativeTheme.themeSource = value;
    refreshTitleBarOverlays();
    return true;
  });
  const storedSuggestionsMode = () =>
    readSuggestionsMode({ suggestionsMode: userPrefs.get('suggestionsMode'), suggestionsEnabled: userPrefs.get('suggestionsEnabled') });
  ipcMain.handle("settings:get-suggestions-mode", async () => storedSuggestionsMode());
  ipcMain.handle("settings:set-suggestions-mode", async (_event, value: unknown) => {
    if (isSuggestionsMode(value)) {
      userPrefs.set('suggestionsMode', value);
      userPrefs.delete('suggestionsEnabled');
    }
    return storedSuggestionsMode();
  });
}

app.whenReady().then(async () => {
  nativeTheme.themeSource = normalizeTheme(userPrefs.get('theme'));
  nativeTheme.on('updated', refreshTitleBarOverlays);
  // Windows/Linux: a menubar é desenhada pelo renderer. macOS mantém o menu nativo padrão.
  if (process.platform !== 'darwin') Menu.setApplicationMenu(null);
  initMainI18n(userPrefs.get('language'));
  const sessionsRoot = join(app.getPath('userData'), 'sessions');
  await SessionStore.sweepStale(sessionsRoot, SESSION_MAX_AGE_MS);
  session = await SessionStore.create(sessionsRoot);

  registerProjectHandlers({
    getStore: getSession,
    saveQueue,
    onSaveStarted: (token) => saveThenClose.onSaveStarted(token),
    onSaveFinished: (token, ok) => saveThenClose.onSaveFinished(token, ok),
  });
  registerDocxExportHandler();
  registerImageHandlers();
  registerSessionImageHandlers(getSession);
  registerSystemHandlers();
  registerAppStateHandlers();
  createWindow();
});

// B3: an in-flight save still reads images from the session; delete it only
// after every save has finished (preventDefault, await, then quit again).
app.on(
  'will-quit',
  createQuitGuard({
    isBusy: () => saveQueue.busy,
    idle: () => saveQueue.idle(),
    dispose: () => {
      session?.disposeSync();
      session = null;
    },
    quit: () => app.quit(),
  }),
);

// N2: remember that the user asked to quit (Cmd+Q) while the close prompt holds it.
app.on('before-quit', () => closeFlow.onBeforeQuit());

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
