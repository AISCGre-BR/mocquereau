import { contextBridge, ipcRenderer } from "electron";

const ALLOWED_PROTOCOLS = ["https:", "http:"];

contextBridge.exposeInMainWorld("mocquereau", {
  // Projeto
  saveProject: (project: unknown, existingPath?: string) =>
    ipcRenderer.invoke("project:save", project, existingPath),

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
