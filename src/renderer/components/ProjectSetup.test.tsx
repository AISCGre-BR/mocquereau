// @vitest-environment jsdom
import "../i18n";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useEffect } from "react";
import { ProjectSetup } from "./ProjectSetup";
import { ProjectContext, createNewProject, useProjectReducer } from "../hooks/useProject";
import { syllabifyText } from "../lib/syllabify";
import type { MocquereauAPI, MocquereauProject } from "../lib/models";
import ptBR from "../i18n/locales/pt-BR.json";

let latest: { isDirty: boolean; project: MocquereauProject | null } = { isDirty: false, project: null };

function Harness({ project, show }: { project: MocquereauProject; show: boolean }) {
  const [state, dispatch] = useProjectReducer();
  useEffect(() => {
    dispatch({ type: "SET_PROJECT", payload: project });
  }, [project]);
  latest = state;
  return (
    <ProjectContext.Provider value={{ state, dispatch }}>
      {show && state.project ? (
        <ProjectSetup />
      ) : null}
    </ProjectContext.Provider>
  );
}

function projectWith(raw: string, words = syllabifyText(raw, "sung")): MocquereauProject {
  const base = createNewProject("Introito", "");
  return { ...base, text: { raw, words, hyphenationMode: "sung" } };
}

const wait = (ms: number) => act(() => new Promise<void>((resolve) => setTimeout(resolve, ms)));

beforeEach(() => {
  window.mocquereau = { getRecent: vi.fn().mockResolvedValue([]) } as unknown as MocquereauAPI;
});
afterEach(cleanup);

describe("ProjectSetup como vista", () => {
  it("montar sobre um projeto não o marca como editado", async () => {
    render(<Harness project={projectWith("Puer natus est")} show />);
    await wait(400);
    expect(latest.isDirty).toBe(false);
  });

  it("sílabas editadas fora da silabificação automática são preservadas ao montar", async () => {
    const manual = [
      { original: "Puer", syllables: ["Puer"] },
      { original: "natus", syllables: ["natus"] },
      { original: "est", syllables: ["est"] },
    ];
    const project = projectWith("Puer natus est", manual);
    render(<Harness project={project} show />);
    await wait(400);
    expect(latest.isDirty).toBe(false);
    expect(latest.project?.text.words).toEqual(manual);
    expect(screen.getAllByDisplayValue("Puer natus est")).toHaveLength(2);
  });

  it("editar o texto litúrgico continua gravando no projeto", async () => {
    render(<Harness project={projectWith("Puer natus est")} show />);
    fireEvent.change(screen.getByPlaceholderText(ptBR["projectSetup.liturgicalTextPlaceholder"]), {
      target: { value: "Puer natus est nobis" },
    });
    await wait(400);
    expect(latest.isDirty).toBe(true);
    expect(latest.project?.text.raw).toBe("Puer natus est nobis");
  });

  it("título digitado e vista trocada antes de 300 ms não se perde", () => {
    const project = projectWith("Puer natus est");
    const { rerender } = render(<Harness project={project} show />);
    fireEvent.change(screen.getByPlaceholderText(ptBR["projectSetup.projectTitlePlaceholder"]), {
      target: { value: "Introito do Natal" },
    });
    rerender(<Harness project={project} show={false} />);
    expect(latest.project?.meta.title).toBe("Introito do Natal");
  });

  it("texto litúrgico digitado e vista trocada antes de 300 ms é gravado com as sílabas", () => {
    const project = projectWith("Puer natus est");
    const { rerender } = render(<Harness project={project} show />);
    fireEvent.change(screen.getByPlaceholderText(ptBR["projectSetup.liturgicalTextPlaceholder"]), {
      target: { value: "Puer natus est nobis" },
    });
    rerender(<Harness project={project} show={false} />);
    expect(latest.isDirty).toBe(true);
    expect(latest.project?.text.raw).toBe("Puer natus est nobis");
    expect(latest.project?.text.words).toEqual(syllabifyText("Puer natus est nobis", "sung"));
  });

  it("sílabas editadas à mão e vista trocada antes da gravação são preservadas", () => {
    const project = projectWith("Puer natus est");
    const { rerender } = render(<Harness project={project} show />);
    fireEvent.change(screen.getByPlaceholderText(ptBR["projectSetup.syllabificationPlaceholder"]), {
      target: { value: "Pu-er na-tus est" },
    });
    rerender(<Harness project={project} show={false} />);
    expect(latest.project?.text.words.map((w) => w.syllables)).toEqual([["Pu", "er"], ["na", "tus"], ["est"]]);
  });

  it("sem edição, sair da vista não grava nada", () => {
    const project = projectWith("Puer natus est");
    const { rerender } = render(<Harness project={project} show />);
    rerender(<Harness project={project} show={false} />);
    expect(latest.isDirty).toBe(false);
  });
});

