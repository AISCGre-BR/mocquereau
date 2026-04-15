import { app, BrowserWindow, ipcMain, shell, dialog } from "electron";
import { join } from "node:path";
import { registerProjectHandlers } from './project-io';
import { registerImageHandlers } from './iiif-fetch';
import { registerDocxExportHandler } from './docx-export';

// Track dirty state for close confirmation. Set via IPC from renderer.
let projectIsDirty = false;
// User already confirmed discard? Skip the next close prompt to avoid loops.
let bypassCloseConfirm = false;

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

  // Phase 8 will integrate electron-conf for persistence
  ipcMain.handle("settings:get-language", async () => "pt-BR");
  ipcMain.handle("settings:set-language", async (_event, lang: string) => lang);
  ipcMain.handle("settings:get-theme", async () => "light");
  ipcMain.handle("settings:set-theme", async (_event, _theme: string) => true);
}

app.whenReady().then(() => {
  registerProjectHandlers();
  registerDocxExportHandler();
  registerImageHandlers();
  registerSystemHandlers();
  createWindow();
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
