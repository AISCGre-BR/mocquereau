// @vitest-environment jsdom
import i18n from "../i18n";
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { Welcome, displayName } from "./Welcome";
import type { MocquereauAPI } from "../lib/models";

afterEach(async () => {
  cleanup();
  vi.restoreAllMocks();
  await i18n.changeLanguage("pt-BR");
});

function mockApi(recent: string[]) {
  const api = {
    getRecent: vi.fn().mockResolvedValue(recent.map((path) => ({ path }))),
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

  it("seletor de idioma no canto: globo + endônimo atual, troca o idioma antes de abrir projeto", async () => {
    mockApi([]);
    render(<Welcome onNew={vi.fn()} onOpen={vi.fn()} onOpenRecent={vi.fn()} />);
    const picker = await screen.findByRole("button", { name: "Idioma / Language: Português" });
    expect(picker.textContent).toContain("Português");
    expect(picker.getAttribute("aria-haspopup")).toBe("menu");
    fireEvent.click(picker);
    const menu = screen.getByRole("menu", { name: "Idioma / Language" });
    const options = Array.from(menu.querySelectorAll('[role="menuitemcheckbox"]')).map((el) => el.textContent);
    expect(options).toEqual(["Português", "English", "Italiano", "Español", "Deutsch", "Polski", "日本語"]);
    expect(screen.getByRole("menuitemcheckbox", { name: "Português" }).getAttribute("aria-checked")).toBe("true");
    await act(async () => {
      fireEvent.click(screen.getByRole("menuitemcheckbox", { name: "日本語" }));
    });
    expect(i18n.language).toBe("ja");
    expect(screen.queryByRole("menu")).toBeNull();
    expect(screen.getByRole("button", { name: "言語 / Language: 日本語" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "新規プロジェクト" })).toBeTruthy();
  });

  it("Esc fecha o seletor de idioma e devolve o foco ao botão", async () => {
    mockApi([]);
    render(<Welcome onNew={vi.fn()} onOpen={vi.fn()} onOpenRecent={vi.fn()} />);
    const picker = await screen.findByRole("button", { name: /Language/ });
    fireEvent.click(picker);
    fireEvent.keyDown(document.activeElement!, { key: "Escape" });
    expect(screen.queryByRole("menu")).toBeNull();
    expect(document.activeElement).toBe(picker);
  });
});
