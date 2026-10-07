import { contextBridge, ipcRenderer } from "electron";

const ALLOWED_PROTOCOLS = ["https:", "http:"];

contextBridge.exposeInMainWorld("mocquereau", {
  // Plataforma (win32 | darwin | linux): a menubar React se ajusta à moldura.
  platform: process.platform,

  // Projeto
  saveProject: (project: unknown, existingPath?: string) =>
    ipcRenderer.invoke("project:save", project, existingPath),

  setDirty: (isDirty: boolean) =>
    ipcRenderer.invoke("project:set-dirty", isDirty),

  openProjectByPath: (filePath: string) =>
    ipcRenderer.invoke("project:open-by-path", filePath),

  // App state (recent files, tutorial, version)
  getRecentFiles: () => ipcRenderer.invoke("app:get-recent-files"),
  addRecentFile: (filePath: string) => ipcRenderer.invoke("app:add-recent-file", filePath),
  clearRecentFiles: () => ipcRenderer.invoke("app:clear-recent-files"),
  getTutorialSeen: () => ipcRenderer.invoke("app:get-tutorial-seen"),
  setTutorialSeen: (seen: boolean) => ipcRenderer.invoke("app:set-tutorial-seen", seen),
  getAppVersion: () => ipcRenderer.invoke("app:get-version"),

  openProject: () =>
    ipcRenderer.invoke("project:open"),

  importGueranger: () =>
    ipcRenderer.invoke("project:import-gueranger"),

  // Exportação
  exportDocx: (project: unknown) =>
    ipcRenderer.invoke("export:docx", project),

  // Imagens
  fetchIiifImage: (url: string) =>
    ipcRenderer.invoke("image:fetch-iiif", url),

  readClipboardImage: () =>
    ipcRenderer.invoke("image:read-clipboard"),

  openImageFile: () =>
    ipcRenderer.invoke("image:open-file"),

  // Sistema
  openExternal: (url: string): Promise<void> => {
    try {
      const parsed = new URL(url);
      if (ALLOWED_PROTOCOLS.includes(parsed.protocol)) {
        return ipcRenderer.invoke("shell:open-external", url);
      }
    } catch {
      // Invalid URL — silently ignore
    }
    return Promise.resolve();
  },

  getLanguage: () =>
    ipcRenderer.invoke("settings:get-language"),

  setLanguage: (lang: string) =>
    ipcRenderer.invoke("settings:set-language", lang),

  getTheme: () =>
    ipcRenderer.invoke("settings:get-theme"),

  setTheme: (theme: string) =>
    ipcRenderer.invoke("settings:set-theme", theme),
});
