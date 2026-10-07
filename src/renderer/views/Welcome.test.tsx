// @vitest-environment jsdom
import "../i18n";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { Welcome, displayName } from "./Welcome";
import type { MocquereauAPI } from "../lib/models";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function mockApi(recent: string[]) {
  const api = {
    getRecentFiles: vi.fn().mockResolvedValue(recent),
    getAppVersion: vi.fn().mockResolvedValue("0.0.7-alpha"),
    clearRecentFiles: vi.fn().mockResolvedValue(undefined),
  };
  window.mocquereau = api as unknown as MocquereauAPI;
  return api;
}

describe("Welcome", () => {
  it("Novo projeto (preenchido) e Abrir… (elevado) chamam os callbacks", async () => {
    mockApi([]);
    const onNew = vi.fn();
    const onOpen = vi.fn();
    render(<Welcome onNew={onNew} onOpen={onOpen} onOpenRecent={vi.fn()} />);
    const novo = await screen.findByRole("button", { name: "Novo projeto" });
    expect(novo.className).toContain("sc-btn--filled");
    fireEvent.click(novo);
    fireEvent.click(screen.getByRole("button", { name: "Abrir…" }));
    expect(onNew).toHaveBeenCalledOnce();
    expect(onOpen).toHaveBeenCalledOnce();
    expect(await screen.findByText("0.0.7-alpha")).toBeTruthy();
  });

  it("lista recentes pelo nome, com o caminho no tooltip, e abre ao clicar", async () => {
    mockApi(["/home/u/Pesquisa/Puer natus est.mocquereau.json", "C:\\Users\\u\\Gloria IV.mocquereau"]);
    const onOpenRecent = vi.fn();
    render(<Welcome onNew={vi.fn()} onOpen={vi.fn()} onOpenRecent={onOpenRecent} />);
    const puer = await screen.findByRole("button", { name: "Puer natus est" });
    expect(puer.getAttribute("title")).toBe("/home/u/Pesquisa/Puer natus est.mocquereau.json");
    expect(screen.getByRole("button", { name: "Gloria IV" })).toBeTruthy();
    fireEvent.click(puer);
    expect(onOpenRecent).toHaveBeenCalledWith("/home/u/Pesquisa/Puer natus est.mocquereau.json");
  });

  it("sem recentes mostra o estado vazio", async () => {
    mockApi([]);
    render(<Welcome onNew={vi.fn()} onOpen={vi.fn()} onOpenRecent={vi.fn()} />);
    expect(await screen.findByText("Nenhum projeto recente.")).toBeTruthy();
  });

  it("Limpar recentes pede confirmação e esvazia a lista", async () => {
    const api = mockApi(["/a/Kyrie IV.mocquereau.json"]);
    vi.spyOn(window, "confirm").mockReturnValue(true);
    render(<Welcome onNew={vi.fn()} onOpen={vi.fn()} onOpenRecent={vi.fn()} />);
    await screen.findByRole("button", { name: "Kyrie IV" });
    fireEvent.click(screen.getByRole("button", { name: "Limpar recentes" }));
    expect(await screen.findByText("Nenhum projeto recente.")).toBeTruthy();
    expect(api.clearRecentFiles).toHaveBeenCalledOnce();
  });

  it("displayName tira pasta e extensão", () => {
    expect(displayName("/x/Puer natus est.mocquereau.json")).toBe("Puer natus est");
    expect(displayName("C:\\x\\Gloria IV.mocquereau")).toBe("Gloria IV");
    expect(displayName("outro.json")).toBe("outro.json");
  });
});
