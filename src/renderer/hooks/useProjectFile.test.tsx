// @vitest-environment jsdom
import "../i18n";
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, renderHook, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { ProjectContext, createNewProject, useProject, useProjectReducer } from "./useProject";
import { AUTOSAVE_DELAY_MS, useProjectFile } from "./useProjectFile";
import { makeThumbnail } from "../lib/thumbnail";
import { Toaster } from "../ui/Toast";
import type { ManuscriptLine, MocquereauAPI, MocquereauProject } from "../lib/models";
import type { RasterLike } from "../lib/box-frame-detect";
import { SUGGESTED_CLASSIFICATION, cloneClassification } from "../../shared/classification";
import { blobs, boxesIn, page } from "../lib/box-frame-detect.fixtures";

vi.mock("../lib/thumbnail", () => ({ makeThumbnail: vi.fn().mockResolvedValue(undefined) }));

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

function Providers({ children }: { children: ReactNode }) {
  const [state, dispatch, history] = useProjectReducer();
  return (
    <Toaster dismissLabel="Dispensar">
      <ProjectContext.Provider value={{ state, dispatch, history }}>{children}</ProjectContext.Provider>
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
    updateRecentMeta: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
  window.mocquereau = api as unknown as MocquereauAPI;
  return api;
}

function withFirstPage(p: MocquereauProject): MocquereauProject {
  const line = {
    id: "l1", image: { dataUrl: "data:image/png;base64,UNIQUE1", width: 10, height: 10, mimeType: "image/png" },
    syllableRange: { start: 0, end: 1 }, dividers: [], gaps: [], syllableBoxes: {}, confirmed: false,
  } as unknown as ManuscriptLine;
  const source = { id: "s", order: 1, metadata: { siglum: "P", library: "", city: "", century: "", classes: [null, null, null] }, lines: [line], syllableCuts: {} };
  return { ...p, sources: [source as never] };
}

function setup() {
  return renderHook(() => ({ file: useProjectFile(), ctx: useProject() }), { wrapper: Providers });
}

describe("useProjectFile", () => {
  it("newProject cria projeto sem arquivo e incrementa projectEpoch", async () => {
    mockApi();
    const { result } = setup();
    await act(async () => result.current.file.newProject());
    expect(result.current.ctx.state.project?.meta.title).toBe("Sem título");
    expect(result.current.ctx.state.currentFilePath).toBeNull();
    expect(result.current.file.projectEpoch).toBe(1);
  });

  it("new project starts from the user library", async () => {
    const lib = cloneClassification(SUGGESTED_CLASSIFICATION);
    lib[0].name = "Notação";
    mockApi({ getClassification: vi.fn().mockResolvedValue(lib) });
    const { result } = setup();
    await act(async () => result.current.file.newProject());
    expect(result.current.ctx.state.project?.classification[0].name).toBe("Notação");
  });

  it("opening a project merges its values into the library without dirtying it", async () => {
    const opened = createNewProject("Extra", "");
    opened.classification = cloneClassification(SUGGESTED_CLASSIFICATION);
    opened.classification[2].values.push({ id: "v-mozarabe", name: "Moçárabe" });
    const api = mockApi({
      getClassification: vi.fn().mockResolvedValue(cloneClassification(SUGGESTED_CLASSIFICATION)),
      setClassification: vi.fn().mockResolvedValue(undefined),
      openProject: vi.fn().mockResolvedValue({ project: opened, filePath: "/x.mocquereau" }),
    });
    const { result } = setup();
    await act(async () => {
      await result.current.file.open();
    });
    await waitFor(() => expect(api.setClassification).toHaveBeenCalled());
    const saved = (api.setClassification as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(saved[2].values.at(-1)).toEqual({ id: "v-mozarabe", name: "Moçárabe" });
    expect(result.current.ctx.state.isDirty).toBe(false);
  });

  it("opening with a failed library read does not overwrite the library", async () => {
    const opened = createNewProject("Extra", "");
    const api = mockApi({
      getClassification: vi.fn().mockRejectedValue(new Error("io")),
      setClassification: vi.fn().mockResolvedValue(undefined),
      openProject: vi.fn().mockResolvedValue({ project: opened, filePath: "/x.mocquereau" }),
    });
    const { result } = setup();
    await act(async () => {
      await result.current.file.open();
    });
    await act(async () => {
      await new Promise((r) => setTimeout(r, 20));
    });
    expect(api.getClassification).toHaveBeenCalled();
    expect(api.setClassification).not.toHaveBeenCalled();
    expect(result.current.ctx.state.isDirty).toBe(false);
  });

  it("a library read failure falls back to the suggested list", async () => {
    mockApi({ getClassification: vi.fn().mockRejectedValue(new Error("io")) });
    const { result } = setup();
    await act(async () => result.current.file.newProject());
    expect(result.current.ctx.state.project?.classification).toEqual(SUGGESTED_CLASSIFICATION);
  });

  it("sends recent meta after opening a project with a path", async () => {
    const api = mockApi({
      openProject: vi.fn().mockResolvedValue({ project: createNewProject("Puer", ""), filePath: "/x.mocquereau" }),
    });
    const { result } = setup();
    await act(async () => {
      await result.current.file.open();
    });
    await waitFor(() =>
      expect(api.updateRecentMeta).toHaveBeenCalledWith(
        "/x.mocquereau",
        expect.objectContaining({ title: "Puer", sources: expect.any(Array) }),
      ),
    );
  });

  it("sends recent meta after a successful save", async () => {
    const api = mockApi();
    const { result } = setup();
    await act(async () => result.current.file.newProject());
    await act(async () => {
      await result.current.file.save();
    });
    await waitFor(() =>
      expect(api.updateRecentMeta).toHaveBeenCalledWith(
        "/pesquisa/puer.mocquereau",
        expect.objectContaining({ sources: expect.any(Array) }),
      ),
    );
  });

  it("reuses the thumbnail when two saves share the same first page", async () => {
    const mk = vi.mocked(makeThumbnail);
    mk.mockClear();
    mk.mockResolvedValue("data:image/jpeg;base64,CACHE");
    const api = mockApi();
    const { result } = setup();
    await act(async () => result.current.file.newProject());
    act(() => {
      result.current.ctx.dispatch({ type: "SET_PROJECT", payload: withFirstPage(result.current.ctx.state.project!) } as never);
    });
    await act(async () => {
      await result.current.file.save();
    });
    await act(async () => {
      await result.current.file.save();
    });
    await waitFor(() => expect(api.updateRecentMeta).toHaveBeenCalledTimes(2));
    expect(mk).toHaveBeenCalledTimes(1);
    mk.mockResolvedValue(undefined);
  });

  it("a project whose source has no lines array still saves without an error toast", async () => {
    const api = mockApi();
    const { result } = setup();
    await act(async () => result.current.file.newProject());
    act(() => {
      const p = result.current.ctx.state.project!;
      result.current.ctx.dispatch({ type: "SET_PROJECT", payload: { ...p, sources: [{ id: "s" } as never] } } as never);
    });
    let ok = false;
    await act(async () => {
      ok = await result.current.file.save();
    });
    expect(ok).toBe(true);
    expect(api.saveProject).toHaveBeenCalled();
    expect(screen.queryByText(/Não foi possível salvar/)).toBeNull();
  });

  it("does not send meta for a project without a path", async () => {
    const api = mockApi({
      openProject: vi.fn().mockResolvedValue({ project: createNewProject("Antigo", ""), filePath: null }),
    });
    const { result } = setup();
    await act(async () => result.current.file.newProject());
    await act(async () => {
      await result.current.file.open();
    });
    await new Promise((r) => setTimeout(r, 20));
    expect(api.updateRecentMeta).not.toHaveBeenCalled();
  });

  it("save sem arquivo pede o caminho, grava, limpa o Editado e confirma com toast", async () => {
    const api = mockApi();
    const { result } = setup();
    await act(async () => result.current.file.newProject());
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
    await act(async () => result.current.file.newProject());
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
    await act(async () => result.current.file.newProject());
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

  it("openExample adota o exemplo sem caminho, limpo, sem recentes e sem realinhar", async () => {
    const opened = createNewProject("Dominus dixit ad me", "");
    opened.classification = cloneClassification(SUGGESTED_CLASSIFICATION);
    opened.classification[2].values.push({ id: "v-exemplo", name: "Exemplo" });
    const loadRaster = vi.fn(async () => null);
    const setClassification = vi.fn().mockResolvedValue(undefined);
    const api = mockApi({
      openExample: vi.fn().mockResolvedValue({ project: opened, filePath: null }),
      getClassification: vi.fn().mockResolvedValue(cloneClassification(SUGGESTED_CLASSIFICATION)),
      setClassification,
    });
    const { result } = renderHook(() => ({ file: useProjectFile({ loadRaster }), ctx: useProject() }), {
      wrapper: Providers,
    });
    await act(async () => {
      await result.current.file.openExample();
    });
    await waitFor(() => expect(setClassification).toHaveBeenCalledTimes(1));
    // Mesma mesclagem silenciosa da abertura de arquivo: o valor do exemplo entra na biblioteca.
    const merged = setClassification.mock.calls[0][0];
    expect(merged[2].values.some((v: { id: string }) => v.id === "v-exemplo")).toBe(true);
    expect(result.current.ctx.state.project?.meta.title).toBe("Dominus dixit ad me");
    expect(result.current.ctx.state.currentFilePath).toBeNull();
    expect(result.current.ctx.state.isDirty).toBe(false);
    expect(result.current.ctx.history?.canUndo).toBe(false);
    expect(loadRaster).not.toHaveBeenCalled();
    expect(api.updateRecentMeta).not.toHaveBeenCalled();
    expect(api.addRecentFile).not.toHaveBeenCalled();
  });

  it("openExample que falha mostra erro e mantém o projeto", async () => {
    mockApi({ openExample: vi.fn().mockResolvedValue(null) });
    const { result } = setup();
    await act(async () => result.current.file.newProject());
    await act(async () => {
      await result.current.file.openExample();
    });
    expect(screen.getAllByRole("alert")).toHaveLength(1);
    expect(result.current.ctx.state.project?.meta.title).toBe("Sem título");
  });

  it("edição feita durante o salvamento continua pendente (snapshot do ponto salvo)", async () => {
    let resolveSave: (v: { filePath: string }) => void = () => undefined;
    mockApi({ saveProject: vi.fn(() => new Promise((r) => (resolveSave = r))) });
    const { result } = setup();
    await act(async () => result.current.file.newProject());
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
    await act(async () => result.current.file.newProject());
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
    await act(async () => result.current.file.newProject());
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

  it("com alterações, Novo projeto pergunta e respeita o Cancelar", async () => {
    mockApi();
    const { result } = setup();
    await act(async () => result.current.file.newProject());
    act(() => result.current.ctx.dispatch({ type: "SET_META", payload: { title: "Puer" } }));
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    await act(async () => result.current.file.newProject());
    expect(confirm).toHaveBeenCalledOnce();
    expect(result.current.ctx.state.project?.meta.title).toBe("Puer");
    expect(result.current.file.projectEpoch).toBe(1);
  });

  it("fechar volta para sem projeto", async () => {
    mockApi();
    const { result } = setup();
    await act(async () => result.current.file.newProject());
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
        metadata: { siglum: "X", library: "", city: "", century: "", classes: [null, null, null] },
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

  it("corrige o referencial ao carregar: limpo, sem passo de histórico e sem toast", async () => {
    mockApi({ openProjectByPath: vi.fn().mockResolvedValue({ project: legacyProject(), filePath: null }) });
    const { result } = setupWith(async () => RASTER);
    await act(async () => {
      await result.current.file.openRecent("/gloria.mocquereau.json");
    });
    const [rot, plain] = result.current.ctx.state.project!.sources[0].lines;
    expect(rot.boxFrame).toEqual(R0);
    expect(rot.imageAdjustments).toEqual(ADJ5);
    expect(plain.boxFrame).toBeUndefined();
    expect(result.current.ctx.state.isDirty).toBe(false);
    expect(result.current.ctx.history?.canUndo).toBe(false);
    expect(screen.queryByRole("status")).toBeNull();
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
