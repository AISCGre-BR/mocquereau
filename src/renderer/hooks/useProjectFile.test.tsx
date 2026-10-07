// @vitest-environment jsdom
import "../i18n";
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, renderHook, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { ProjectContext, createNewProject, useProject, useProjectReducer } from "./useProject";
import { AUTOSAVE_DELAY_MS, useProjectFile } from "./useProjectFile";
import { Toaster } from "../ui/Toast";
import type { MocquereauAPI } from "../lib/models";

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
    saveProject: vi.fn().mockResolvedValue({ filePath: "/pesquisa/puer.mocquereau.json" }),
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
    expect(result.current.ctx.state.currentFilePath).toBe("/pesquisa/puer.mocquereau.json");
    expect(result.current.ctx.state.isDirty).toBe(false);
    expect(api.addRecentFile).toHaveBeenCalledWith("/pesquisa/puer.mocquereau.json");
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
      openProjectByPath: vi.fn().mockResolvedValue({ project: createNewProject("Puer", ""), filePath: "/p.mocquereau.json" }),
    });
    const { result } = setup();
    await act(async () => {
      await result.current.file.openRecent("/p.mocquereau.json");
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
    expect(saveProject).toHaveBeenLastCalledWith(expect.anything(), "/p.mocquereau.json");
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
      openProject: vi.fn().mockResolvedValue({ project: createNewProject("Sanctus VIII", ""), filePath: "/s.mocquereau.json" }),
    });
    const { result } = renderHook(() => ({ file: useProjectFile({ onOpened }), ctx: useProject() }), { wrapper: Providers });
    act(() => result.current.file.newProject());
    await act(async () => {
      await result.current.file.open();
    });
    expect(result.current.ctx.state.project?.meta.title).toBe("Sanctus VIII");
    expect(result.current.ctx.state.currentFilePath).toBe("/s.mocquereau.json");
    expect(result.current.file.projectEpoch).toBe(2);
    expect(onOpened).toHaveBeenCalledTimes(2);
    expect(api.addRecentFile).toHaveBeenCalledWith("/s.mocquereau.json");
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
