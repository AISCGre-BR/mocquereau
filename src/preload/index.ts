import { contextBridge, ipcRenderer } from "electron";
import type { RecentMeta } from "../shared/recent";

const ALLOWED_PROTOCOLS = ["https:", "http:"];

contextBridge.exposeInMainWorld("mocquereau", {
  // Plataforma (win32 | darwin | linux): a menubar React se ajusta à moldura.
  platform: process.platform,

  // Projeto
  saveProject: (project: unknown, existingPath?: string) =>
    ipcRenderer.invoke("project:save", project, existingPath),

  saveProjectAs: (project: unknown, currentPath?: string) =>
    ipcRenderer.invoke("project:save-as", project, currentPath),

  setDirty: (isDirty: boolean) =>
    ipcRenderer.invoke("project:set-dirty", isDirty),

  // "Salvar" no diálogo de fechar: o main pede, o renderer salva.
  onSaveRequested: (callback: () => void): (() => void) => {
    const listener = () => callback();
    ipcRenderer.on("app:request-save", listener);
    return () => {
      ipcRenderer.removeListener("app:request-save", listener);
    };
  },

  openProjectByPath: (filePath: string) =>
    ipcRenderer.invoke("project:open-by-path", filePath),

  // App state (recent files, tutorial, version)
  getRecent: () => ipcRenderer.invoke("app:get-recent"),
  updateRecentMeta: (filePath: string, meta: RecentMeta) => ipcRenderer.invoke("app:update-recent-meta", filePath, meta),
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
  putImage: (bytes: ArrayBuffer, mimeType: string) =>
    ipcRenderer.invoke("images:put", { bytes, mimeType }),

  getImages: (imageIds: string[]) =>
    ipcRenderer.invoke("images:get", imageIds),

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

  getClassification: () =>
    ipcRenderer.invoke("settings:get-classification"),

  setClassification: (c: unknown) =>
    ipcRenderer.invoke("settings:set-classification", c),

  getTheme: () =>
    ipcRenderer.invoke("settings:get-theme"),

  setTheme: (theme: string) =>
    ipcRenderer.invoke("settings:set-theme", theme),
});
