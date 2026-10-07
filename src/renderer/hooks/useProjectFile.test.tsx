// @vitest-environment jsdom
import "../i18n";
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, renderHook, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { ProjectContext, createNewProject, useProject, useProjectReducer } from "./useProject";
import { AUTOSAVE_DELAY_MS, useProjectFile } from "./useProjectFile";
import { Toaster } from "../ui/Toast";
import type { ManuscriptLine, MocquereauAPI, MocquereauProject } from "../lib/models";
import type { RasterLike } from "../lib/box-frame-detect";
import { blobs, boxesIn, page } from "../lib/box-frame-detect.fixtures";

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

function Providers({ children }: { children: ReactNode }) {
  const [state, dispatch] = useProjectReducer();
  return (
    <Toaster dismissLabel="Dispensar">
      <ProjectContext.Provider value={{ state, dispatch }}>{children}</ProjectContext.Provider>
    </Toaster>
  );
}

function mockApi(overrides: Partial<Record<keyof MocquereauAPI, unknown>> = {}) {
  const api = {
    setDirty: vi.fn().mockResolvedValue(undefined),
    addRecentFile: vi.fn().mockResolvedValue(undefined),
    saveProject: vi.fn().mockResolvedValue({ filePath: "/pesquisa/puer.mocquereau" }),
    saveProjectAs: vi.fn().mockResolvedValue({ filePath: "/pesquisa/copia.mocquereau" }),
    openProject: vi.fn().mockResolvedValue(null),
    openProjectByPath: vi.fn().mockResolvedValue(null),
    importGueranger: vi.fn().mockResolvedValue(null),
    ...overrides,
  };
  window.mocquereau = api as unknown as MocquereauAPI;
  return api;
}

function setup() {
  return renderHook(() => ({ file: useProjectFile(), ctx: useProject() }), { wrapper: Providers });
}

describe("useProjectFile", () => {
  it("newProject cria projeto sem arquivo e incrementa projectEpoch", () => {
    mockApi();
    const { result } = setup();
    act(() => result.current.file.newProject());
    expect(result.current.ctx.state.project?.meta.title).toBe("Sem título");
    expect(result.current.ctx.state.currentFilePath).toBeNull();
    expect(result.current.file.projectEpoch).toBe(1);
  });

  it("save sem arquivo pede o caminho, grava, limpa o Editado e confirma com toast", async () => {
    const api = mockApi();
    const { result } = setup();
    act(() => result.current.file.newProject());
    act(() => result.current.ctx.dispatch({ type: "SET_META", payload: { title: "Puer natus est" } }));
    expect(result.current.ctx.state.isDirty).toBe(true);
    await act(async () => {
      expect(await result.current.file.save()).toBe(true);
    });
    expect(api.saveProject).toHaveBeenCalledWith(
      expect.objectContaining({ meta: expect.objectContaining({ title: "Puer natus est" }) }),
      undefined,
    );
    expect(result.current.ctx.state.currentFilePath).toBe("/pesquisa/puer.mocquereau");
    expect(result.current.ctx.state.isDirty).toBe(false);
    // Recentes são registrados pelo main (project-io).
    expect(api.addRecentFile).not.toHaveBeenCalled();
    expect(screen.getByRole("status").textContent).toContain("Projeto salvo.");
  });

  it("falha ao gravar mostra erro persistente e o projeto continua editado", async () => {
    mockApi({ saveProject: vi.fn().mockRejectedValue(new Error("EACCES: permission denied")) });
    const { result } = setup();
    act(() => result.current.file.newProject());
    act(() => result.current.ctx.dispatch({ type: "SET_META", payload: { title: "Puer" } }));
    await act(async () => {
      expect(await result.current.file.save()).toBe(false);
    });
    expect(result.current.ctx.state.isDirty).toBe(true);
    expect(screen.getByRole("alert").textContent).toContain("EACCES: permission denied");
  });

  it("autosave grava no arquivo atual e, se falhar de novo, não empilha toasts iguais", async () => {
    vi.useFakeTimers();
    const saveProject = vi.fn().mockRejectedValue(new Error("ENOSPC"));
    mockApi({
      saveProject,
      openProjectByPath: vi.fn().mockResolvedValue({ project: createNewProject("Puer", ""), filePath: "/p.mocquereau" }),
    });
    const { result } = setup();
    await act(async () => {
      await result.current.file.openRecent("/p.mocquereau");
    });
    act(() => result.current.ctx.dispatch({ type: "SET_META", payload: { author: "A" } }));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(AUTOSAVE_DELAY_MS);
    });
    act(() => result.current.ctx.dispatch({ type: "SET_META", payload: { author: "B" } }));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(AUTOSAVE_DELAY_MS);
    });
    expect(saveProject).toHaveBeenCalledTimes(2);
    expect(saveProject).toHaveBeenLastCalledWith(expect.anything(), "/p.mocquereau");
    expect(screen.getAllByRole("alert")).toHaveLength(1);
  });

  it("openRecent de arquivo ausente mostra erro e mantém o projeto", async () => {
    mockApi();
    const { result } = setup();
    await act(async () => {
      await result.current.file.openRecent("/sumiu.mocquereau.json");
    });
    expect(result.current.ctx.state.project).toBeNull();
    expect(screen.getByRole("alert").textContent).toContain("/sumiu.mocquereau.json");
  });

  it("abrir outro projeto troca o conteúdo e incrementa projectEpoch (as vistas remontam)", async () => {
    const onOpened = vi.fn();
    const api = mockApi({
      openProject: vi.fn().mockResolvedValue({ project: createNewProject("Sanctus VIII", ""), filePath: "/s.mocquereau" }),
    });
    const { result } = renderHook(() => ({ file: useProjectFile({ onOpened }), ctx: useProject() }), { wrapper: Providers });
    act(() => result.current.file.newProject());
    await act(async () => {
      await result.current.file.open();
    });
    expect(result.current.ctx.state.project?.meta.title).toBe("Sanctus VIII");
    expect(result.current.ctx.state.currentFilePath).toBe("/s.mocquereau");
    expect(result.current.file.projectEpoch).toBe(2);
    expect(onOpened).toHaveBeenCalledTimes(2);
    expect(api.addRecentFile).not.toHaveBeenCalled();
  });

  it("saveAs usa project:save-as com o caminho atual", async () => {
    const api = mockApi({
      openProjectByPath: vi.fn().mockResolvedValue({ project: createNewProject("Puer", ""), filePath: "/p.mocquereau" }),
    });
    const { result } = setup();
    await act(async () => {
      await result.current.file.openRecent("/p.mocquereau");
    });
    await act(async () => {
      expect(await result.current.file.saveAs()).toBe(true);
    });
    expect(api.saveProjectAs).toHaveBeenCalledWith(expect.anything(), "/p.mocquereau");
    expect(api.saveProject).not.toHaveBeenCalled();
    expect(result.current.ctx.state.currentFilePath).toBe("/pesquisa/copia.mocquereau");
  });

  it("arquivo legado abre sem caminho: autosave desligado e Salvar pede destino", async () => {
    vi.useFakeTimers();
    const api = mockApi({
      openProjectByPath: vi.fn().mockResolvedValue({ project: createNewProject("Antigo", ""), filePath: null }),
    });
    const { result } = setup();
    await act(async () => {
      await result.current.file.openRecent("/antigo.mocquereau.json");
    });
    expect(result.current.ctx.state.currentFilePath).toBeNull();
    act(() => result.current.ctx.dispatch({ type: "SET_META", payload: { author: "A" } }));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(AUTOSAVE_DELAY_MS * 2);
    });
    expect(api.saveProject).not.toHaveBeenCalled();
    await act(async () => {
      await result.current.file.save();
    });
    expect(api.saveProject).toHaveBeenCalledWith(expect.anything(), undefined);
    expect(result.current.ctx.state.currentFilePath).toBe("/pesquisa/puer.mocquereau");
  });

  it("edição feita durante o salvamento continua pendente (snapshot do ponto salvo)", async () => {
    let resolveSave: (v: { filePath: string }) => void = () => undefined;
    mockApi({ saveProject: vi.fn(() => new Promise((r) => (resolveSave = r))) });
    const { result } = setup();
    act(() => result.current.file.newProject());
    act(() => result.current.ctx.dispatch({ type: "SET_META", payload: { title: "Puer" } }));
    let pending: Promise<boolean> = Promise.resolve(false);
    act(() => {
      pending = result.current.file.save();
    });
    act(() => result.current.ctx.dispatch({ type: "SET_META", payload: { author: "Durante" } }));
    await act(async () => {
      resolveSave({ filePath: "/x.mocquereau" });
      await pending;
    });
    expect(result.current.ctx.state.isDirty).toBe(true);
  });

  it("salvamento de A que termina depois do Novo projeto não vincula o novo projeto ao arquivo de A", async () => {
    vi.useFakeTimers();
    let resolveSave: (v: { filePath: string }) => void = () => undefined;
    const saveProject = vi
      .fn()
      .mockImplementationOnce(() => new Promise((r) => (resolveSave = r)))
      .mockResolvedValue({ filePath: "/a.mocquereau" });
    mockApi({
      saveProject,
      openProjectByPath: vi.fn().mockResolvedValue({ project: createNewProject("A", ""), filePath: "/a.mocquereau" }),
    });
    vi.spyOn(window, "confirm").mockReturnValue(true);
    const { result } = setup();
    await act(async () => {
      await result.current.file.openRecent("/a.mocquereau");
    });
    act(() => result.current.ctx.dispatch({ type: "SET_META", payload: { author: "edição" } }));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(AUTOSAVE_DELAY_MS);
    });
    expect(saveProject).toHaveBeenCalledTimes(1);
    act(() => result.current.file.newProject());
    await act(async () => {
      resolveSave({ filePath: "/a.mocquereau" });
      await Promise.resolve();
    });
    expect(result.current.ctx.state.project?.meta.title).toBe("Sem título");
    expect(result.current.ctx.state.currentFilePath).toBeNull();
    expect(result.current.ctx.state.isDirty).toBe(false);
    act(() => result.current.ctx.dispatch({ type: "SET_META", payload: { author: "novo" } }));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(AUTOSAVE_DELAY_MS * 2);
    });
    expect(saveProject).toHaveBeenCalledTimes(1);
    expect(result.current.ctx.state.isDirty).toBe(true);
  });

  it("salvamento de A que termina depois de abrir B (recente) não toca o caminho nem o estado de B", async () => {
    vi.useFakeTimers();
    let resolveSave: (v: { filePath: string }) => void = () => undefined;
    const saveProject = vi
      .fn()
      .mockImplementationOnce(() => new Promise((r) => (resolveSave = r)))
      .mockImplementation(async (_p: unknown, path?: string) => ({ filePath: path }));
    const openProjectByPath = vi
      .fn()
      .mockResolvedValueOnce({ project: createNewProject("A", ""), filePath: "/a.mocquereau" })
      .mockResolvedValueOnce({ project: createNewProject("B", ""), filePath: "/b.mocquereau" });
    mockApi({ saveProject, openProjectByPath });
    vi.spyOn(window, "confirm").mockReturnValue(true);
    const { result } = setup();
    await act(async () => {
      await result.current.file.openRecent("/a.mocquereau");
    });
    act(() => result.current.ctx.dispatch({ type: "SET_META", payload: { author: "edição" } }));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(AUTOSAVE_DELAY_MS);
    });
    expect(saveProject).toHaveBeenCalledTimes(1);
    await act(async () => {
      await result.current.file.openRecent("/b.mocquereau");
    });
    act(() => result.current.ctx.dispatch({ type: "SET_META", payload: { author: "edição em B" } }));
    await act(async () => {
      resolveSave({ filePath: "/a.mocquereau" });
      await Promise.resolve();
    });
    expect(result.current.ctx.state.project?.meta.title).toBe("B");
    expect(result.current.ctx.state.currentFilePath).toBe("/b.mocquereau");
    // A edição em B continua pendente: o "salvo" de A não a limpa.
    expect(result.current.ctx.state.isDirty).toBe(true);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(AUTOSAVE_DELAY_MS + 10);
    });
    expect(saveProject).toHaveBeenCalledTimes(2);
    expect(saveProject.mock.calls[1][0].meta.title).toBe("B");
    expect(saveProject.mock.calls[1][1]).toBe("/b.mocquereau");
  });

  it("salvamento que termina depois de Fechar projeto não reabre caminho", async () => {
    let resolveSave: (v: { filePath: string }) => void = () => undefined;
    mockApi({ saveProject: vi.fn(() => new Promise((r) => (resolveSave = r))) });
    const { result } = setup();
    act(() => result.current.file.newProject());
    let saving: Promise<boolean> = Promise.resolve(false);
    act(() => {
      saving = result.current.file.save();
    });
    vi.spyOn(window, "confirm").mockReturnValue(true);
    act(() => result.current.file.close());
    let ok = false;
    await act(async () => {
      resolveSave({ filePath: "/x.mocquereau" });
      ok = await saving;
    });
    expect(ok).toBe(true);
    expect(result.current.ctx.state.project).toBeNull();
    expect(result.current.ctx.state.currentFilePath).toBeNull();
  });

  it("com alterações, Novo projeto pergunta e respeita o Cancelar", () => {
    mockApi();
    const { result } = setup();
    act(() => result.current.file.newProject());
    act(() => result.current.ctx.dispatch({ type: "SET_META", payload: { title: "Puer" } }));
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    act(() => result.current.file.newProject());
    expect(confirm).toHaveBeenCalledOnce();
    expect(result.current.ctx.state.project?.meta.title).toBe("Puer");
    expect(result.current.file.projectEpoch).toBe(1);
  });

  it("fechar volta para sem projeto", () => {
    mockApi();
    const { result } = setup();
    act(() => result.current.file.newProject());
    act(() => result.current.file.close());
    expect(result.current.ctx.state.project).toBeNull();
  });
});

describe("useProjectFile: realinhamento de caixas em arquivo legado", () => {
  const W = 600;
  const H = 400;
  const BLOBS = blobs(W, H);
  const RASTER = page(W, H, BLOBS);
  const R0 = { rotation: 0, flipH: false, flipV: false };
  const R5 = { rotation: 5, flipH: false, flipV: false };
  const ADJ5 = { brightness: 100, contrast: 100, saturation: 100, grayscale: 0, invert: false, rotation: 5, flipH: false, flipV: false };

  function legacyProject(): MocquereauProject {
    const p = createNewProject("Gloria", "");
    const line = (id: string, over: Partial<ManuscriptLine>): ManuscriptLine => ({
      id,
      image: { dataUrl: "data:,", width: W, height: H, mimeType: "image/png" },
      syllableRange: { start: 0, end: 0 },
      dividers: [],
      gaps: [],
      confirmed: true,
      ...over,
    });
    p.sources = [
      {
        id: "S",
        order: 1,
        metadata: { siglum: "X", library: "", city: "", century: "", folio: "", notation: "square" },
        lines: [
          line("rot", { imageAdjustments: ADJ5, boxFrame: R5, syllableBoxes: boxesIn(R0, RASTER, BLOBS) }),
          line("plain", { syllableBoxes: boxesIn(R0, RASTER, BLOBS) }),
        ],
        syllableCuts: {},
      },
    ];
    return p;
  }

  function setupWith(loadRaster: () => Promise<RasterLike | null>) {
    return renderHook(() => ({ file: useProjectFile({ loadRaster }), ctx: useProject() }), { wrapper: Providers });
  }

  it("corrige o referencial em um passo desfazível, avisa com toast e marca editado", async () => {
    mockApi({ openProjectByPath: vi.fn().mockResolvedValue({ project: legacyProject(), filePath: null }) });
    const { result } = setupWith(async () => RASTER);
    await act(async () => {
      await result.current.file.openRecent("/gloria.mocquereau.json");
    });
    await waitFor(() => expect(result.current.ctx.state.isDirty).toBe(true));
    const [rot, plain] = result.current.ctx.state.project!.sources[0].lines;
    expect(rot.boxFrame).toEqual(R0);
    expect(rot.imageAdjustments).toEqual(ADJ5);
    expect(plain.boxFrame).toBeUndefined();
    const toast = screen.getByRole("status");
    expect(toast.textContent).toContain("Caixas de 1 imagem(ns) realinhadas à rotação da imagem.");
    act(() => screen.getByRole("button", { name: "Desfazer" }).click());
    expect(result.current.ctx.state.project!.sources[0].lines[0].boxFrame).toEqual(R5);
    expect(result.current.ctx.state.isDirty).toBe(false);
  });

  it("arquivo .mocquereau (com caminho) não é reanalisado", async () => {
    const loadRaster = vi.fn(async () => RASTER);
    mockApi({ openProjectByPath: vi.fn().mockResolvedValue({ project: legacyProject(), filePath: "/g.mocquereau" }) });
    const { result } = setupWith(loadRaster);
    await act(async () => {
      await result.current.file.openRecent("/g.mocquereau");
    });
    await new Promise((r) => setTimeout(r, 20));
    expect(loadRaster).not.toHaveBeenCalled();
    expect(result.current.ctx.state.project!.sources[0].lines[0].boxFrame).toEqual(R5);
    expect(result.current.ctx.state.isDirty).toBe(false);
  });
});
