// @vitest-environment jsdom
import "../i18n";
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { AnaliseView } from "./AnaliseView";
import { FilterBar } from "../components/analysis/FilterBar";
import { AnalysisFiltersProvider } from "../components/analysis/AnalysisContext";
import { ProjectContext, createNewProject, useProjectReducer, type DocumentAction } from "../hooks/useProject";
import { makeAnalysisProject } from "../../shared/analysis/__fixtures__/analysis-project";
import type { MocquereauProject } from "../lib/models";

afterEach(cleanup);

function mount(p: MocquereauProject) {
  const onOpenOccurrence = vi.fn();
  const ref: { dispatch?: React.Dispatch<DocumentAction> } = {};
  function Harness() {
    const [state, dispatch, history] = useProjectReducer();
    ref.dispatch = dispatch;
    if (!state.project) return null;
    return (
      <ProjectContext.Provider value={{ state, dispatch, history }}>
        <AnalysisFiltersProvider>
          <FilterBar />
          <AnaliseView onOpenOccurrence={onOpenOccurrence} />
        </AnalysisFiltersProvider>
      </ProjectContext.Provider>
    );
  }
  render(<Harness />);
  act(() => ref.dispatch!({ type: "SET_PROJECT", payload: p }));
  return { onOpenOccurrence, dispatch: (a: DocumentAction) => act(() => ref.dispatch!(a)) };
}

const fixture = () => makeAnalysisProject() as unknown as MocquereauProject;
const pair = (a: string, b: string) => document.querySelector(`[data-pair="${a}:${b}"]`) as HTMLElement;

describe("AnaliseView", () => {
  it("projeto sem anotações mostra só o estado vazio", () => {
    mount(createNewProject("T", ""));
    expect(screen.getByText("Ainda não há anotações. Clique numa sílaba em Recortes para anotar.")).toBeTruthy();
    expect(document.querySelector(".sc-panel")).toBeNull();
  });

  it("mostra os blocos; Concordância dá 67% entre E e SG (2 de 3) e — na diagonal", () => {
    mount(fixture());
    for (const title of ["Progresso", "Conteúdo neumático", "Concordância entre fontes", "Liquescências, episemas e letras", "Etiquetas por fonte"]) {
      expect(screen.getByRole("heading", { name: title })).toBeTruthy();
    }
    expect(pair("E", "SG").textContent).toBe("67%");
    expect(pair("E", "E").textContent).toBe("—");
    expect(pair("E", "SG").className).toContain("bg-lapis/");
  });

  it("Por família agrupa as fontes; Mais divergentes lista a sílaba com o número de leituras", () => {
    mount(fixture());
    fireEvent.click(screen.getByRole("tab", { name: "Por família" }));
    expect(pair("familia.sao-galo", "familia.laon").textContent).toBe("67%");
    expect(screen.getAllByText("sem família").length).toBeGreaterThan(0);
    expect(screen.getByRole("button", { name: /le.*3 leituras/ })).toBeTruthy();
  });

  it("filtro Certeza \"não informada\" muda os números", () => {
    mount(fixture());
    fireEvent.click(screen.getByRole("button", { name: "Certeza" }));
    fireEvent.click(screen.getByRole("menuitemcheckbox", { name: "não informada" }));
    expect(screen.getByRole("menuitemcheckbox", { name: "não informada" }).getAttribute("aria-checked")).toBe("true");
    // A sílaba ilegível de E sai: E×SG compara só 0 e 1, que concordam.
    expect(pair("E", "SG").textContent).toBe("100%");
    expect(screen.getByRole("button", { name: /^Certeza: não informada$/ })).toBeTruthy();
  });

  it("Conteúdo alterna contagem e % das sílabas e mostra o equivalente do uncinus", () => {
    mount(fixture());
    const pes = () => screen.getByRole("row", { name: /^pes/ });
    expect(within(pes()).getAllByRole("button")[0].textContent).toBe("1");
    fireEvent.click(screen.getByRole("tab", { name: "% das sílabas" }));
    expect(within(pes()).getAllByRole("button")[0].textContent).toBe("20%");
    expect(screen.getByText("= tractulus")).toBeTruthy();
    expect(screen.getByRole("row", { name: /Média de notas por sílaba/ })).toBeTruthy();
  });

  it("par de fontes: o diálogo lista só as sílabas divergentes; clicar numa fecha e navega", () => {
    const { onOpenOccurrence } = mount(fixture());
    fireEvent.click(pair("E", "SG").querySelector("button")!);
    const dialog = screen.getByRole("dialog", { name: "Sílabas divergentes" });
    const items = within(dialog).getAllByRole("button", { name: /^(E|SG) / });
    expect(items.map((b) => b.getAttribute("aria-label"))).toEqual(["E le", "SG le"]);
    expect(items[0].querySelector("[title='E']")).not.toBeNull();
    fireEvent.click(items[0]);
    expect(onOpenOccurrence).toHaveBeenCalledWith("E", 2);
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("outros números abrem \"Ocorrências\"", () => {
    mount(fixture());
    fireEvent.click(within(screen.getByRole("row", { name: /^pes/ })).getAllByRole("button")[0]);
    expect(screen.getByRole("dialog", { name: "Ocorrências" })).toBeTruthy();
  });

  it("filtro numa fonte apagada deixa de valer: a vista volta a mostrar os dados e o botão fica inativo", () => {
    const { dispatch } = mount(fixture());
    fireEvent.click(screen.getByRole("button", { name: "Fontes" }));
    fireEvent.click(screen.getByRole("menuitemcheckbox", { name: "X" }));
    expect(screen.getByRole("button", { name: "Fontes: X" })).toBeTruthy();
    expect(pair("E", "SG")).toBeNull();
    dispatch({ type: "REMOVE_SOURCE", payload: "X" });
    expect(pair("E", "SG").textContent).toBe("67%");
    expect(screen.getByRole("button", { name: "Fontes" })).toBeTruthy();
  });

  it("% das sílabas: porcentagem indefinida aparece como —", () => {
    mount(fixture());
    fireEvent.click(screen.getByRole("button", { name: "Certeza" }));
    fireEvent.click(screen.getByRole("menuitemcheckbox", { name: "Ilegível" }));
    fireEvent.click(screen.getByRole("tab", { name: "% das sílabas" }));
    // Só E tem uma sílaba ilegível anotada: nas outras fontes não há sílaba anotada.
    const clivis = screen.getByRole("row", { name: /^clivis/ });
    expect(within(clivis).getAllByRole("cell").map((c) => c.textContent).slice(1, 4)).toEqual(["—", "—", "—"]);
  });

  it("nomes dos neumas em serifa", () => {
    mount(fixture());
    expect(screen.getByText("pes").className).toContain("font-serif");
  });
});
