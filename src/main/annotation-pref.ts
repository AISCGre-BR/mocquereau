// "Painel Anotação" of the Recortes view: open or closed is a user preference.

export interface AnnotationPanelPrefStore {
  get(key: "annotationPanelOpen"): boolean | undefined;
  set(key: "annotationPanelOpen", value: boolean): void;
}

interface IpcLike {
  handle(channel: string, listener: (event: unknown, ...args: unknown[]) => unknown): void;
}

/** settings:get/set-annotation-panel; closed unless the user opened it. */
export function registerAnnotationPanelPrefHandlers(ipc: IpcLike, store: AnnotationPanelPrefStore): void {
  ipc.handle("settings:get-annotation-panel", async () => store.get("annotationPanelOpen") === true);
  ipc.handle("settings:set-annotation-panel", async (_event, value) => {
    if (typeof value === "boolean") store.set("annotationPanelOpen", value);
  });
}
