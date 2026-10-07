import { app, BrowserWindow, ipcMain, shell, dialog, Menu, nativeTheme } from "electron";
import { join } from "node:path";
import { Conf } from "electron-conf/main";
import { registerProjectHandlers } from './project-io';
import { registerImageHandlers } from './iiif-fetch';
import { registerDocxExportHandler } from './docx-export';
import { registerAppStateHandlers } from './app-state';
import { normalizeTheme, overlayFor, windowChromeOptions, type ThemePreference } from './window-chrome';

interface UserPrefs {
  language: string;
  theme: ThemePreference;
}

const userPrefs = new Conf<UserPrefs>({
  name: 'user-prefs',
  defaults: { language: 'pt-BR', theme: 'system' },
});

// MOCQUEREAU_NATIVE_FRAME=1 volta à barra de título nativa (gerenciadores de
// janela Linux que não desenham o titleBarOverlay).
const useNativeFrame = process.env.MOCQUEREAU_NATIVE_FRAME === '1';

// Track dirty state for close confirmation. Set via IPC from renderer.
let projectIsDirty = false;
// User already confirmed discard? Skip the next close prompt to avoid loops.
let bypassCloseConfirm = false;

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

function createWindow(): void {
  const win = new BrowserWindow({
    width: 1600,
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
  ipcMain.handle("settings:get-theme", async () => normalizeTheme(userPrefs.get('theme')));
  ipcMain.handle("settings:set-theme", async (_event, theme: unknown) => {
    const value = normalizeTheme(theme);
    userPrefs.set('theme', value);
    nativeTheme.themeSource = value;
    refreshTitleBarOverlays();
    return true;
  });
}

app.whenReady().then(() => {
  nativeTheme.themeSource = normalizeTheme(userPrefs.get('theme'));
  nativeTheme.on('updated', refreshTitleBarOverlays);
  // Windows/Linux: a menubar é desenhada pelo renderer. macOS mantém o menu nativo padrão.
  if (process.platform !== 'darwin') Menu.setApplicationMenu(null);
  registerProjectHandlers();
  registerDocxExportHandler();
  registerImageHandlers();
  registerSystemHandlers();
  registerAppStateHandlers();
  createWindow();
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
