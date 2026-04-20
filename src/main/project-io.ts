import { dialog, ipcMain } from 'electron';
import { readFile, writeFile } from 'node:fs/promises';

// Types are duplicated here to avoid importing from renderer path.
// These must stay in sync with src/renderer/lib/models.ts.
// A shared types path (src/shared/) can be introduced in a future cleanup.
interface ProjectMeta { title: string; author: string; createdAt: string; updatedAt: string; }
// Use 'unknown' for full project — the renderer sends a valid MocquereauProject,
// main process just serializes/deserializes without inspecting fields.
type SerializableProject = { meta: ProjectMeta; [key: string]: unknown };

export function registerProjectHandlers(): void {
  ipcMain.handle('project:save', async (
    _event,
    project: SerializableProject,
    existingPath?: string,
  ) => {
    // If existingPath is provided, overwrite silently (used by Ctrl+S and auto-save).
    if (existingPath) {
      await writeFile(existingPath, JSON.stringify(project, null, 2), 'utf-8');
      return { filePath: existingPath };
    }
    const defaultName = `${project.meta?.title || 'projeto'}.mocquereau.json`;
    const { canceled, filePath } = await dialog.showSaveDialog({
      title: 'Salvar projeto',
      defaultPath: defaultName,
      filters: [{ name: 'Projeto Mocquereau', extensions: ['mocquereau.json'] }],
    });
    if (canceled || !filePath) return null;
    await writeFile(filePath, JSON.stringify(project, null, 2), 'utf-8');
    return { filePath };
  });

  ipcMain.handle('project:open', async () => {
    const { canceled, filePaths } = await dialog.showOpenDialog({
      title: 'Abrir projeto',
      filters: [{ name: 'Projeto Mocquereau', extensions: ['mocquereau.json'] }],
      properties: ['openFile'],
    });
    if (canceled || !filePaths[0]) return null;
    const raw = await readFile(filePaths[0], 'utf-8');
    const project = JSON.parse(raw);
    // SYLL-06 compat: v1.0 saved as 'liturgical'; v1.1 renamed the exact-same
    // behavior to 'liturgical-typographic'. Map legacy → renamed to preserve
    // syllableBox indices (changing to 'sung' would shift word boundaries and
    // desalign crops in existing projects). New projects default to 'sung'.
    if (project?.text?.hyphenationMode === 'liturgical') {
      project.text.hyphenationMode = 'liturgical-typographic';
    }
    return { project, filePath: filePaths[0] };
  });

  // Open a specific project file directly (used by "recent files" list)
  ipcMain.handle('project:open-by-path', async (_event, filePath: string) => {
    try {
      const raw = await readFile(filePath, 'utf-8');
      const project = JSON.parse(raw);
      // Same legacy compat as project:open — preserve syllableBox alignment.
      if (project?.text?.hyphenationMode === 'liturgical') {
        project.text.hyphenationMode = 'liturgical-typographic';
      }
      return { project, filePath };
    } catch {
      return null;
    }
  });

  ipcMain.handle('project:import-gueranger', async () => {
    const { canceled, filePaths } = await dialog.showOpenDialog({
      title: 'Importar do Gueranger',
      filters: [{ name: 'Exportação Gueranger', extensions: ['json'] }],
      properties: ['openFile'],
    });
    if (canceled || !filePaths[0]) return null;
    const raw = await readFile(filePaths[0], 'utf-8');
    return JSON.parse(raw);
  });
}
