// @vitest-environment jsdom
import i18n from "../i18n";
import type { ComponentProps } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { Welcome, displayName } from "./Welcome";
import type { MocquereauAPI } from "../lib/models";

afterEach(async () => {
  cleanup();
  vi.restoreAllMocks();
  await i18n.changeLanguage("pt-BR");
});

function mockApi(overrides: Record<string, unknown> = {}) {
  const api = {
    getRecent: vi.fn().mockResolvedValue([]),
    ...overrides,
  };
  window.mocquereau = api as unknown as MocquereauAPI;
  return api;
}

const ENTRY = (path: string, meta?: object) => ({ path, meta });
const META = {
  title: "Gloria VIII",
  author: "André Gaby",
  updatedAt: "2026-04-27T12:00:00.000Z",
  thumb: "data:image/jpeg;base64,AA",
  sources: [{ siglum: "P - AR Res. Ms. 016", progress: 0.96 }],
};

function renderWelcome(props: Partial<ComponentProps<typeof Welcome>> = {}) {
  return render(
    <Welcome onNew={vi.fn()} onOpen={vi.fn()} onOpenRecent={vi.fn()} onOpenExample={vi.fn()} {...props} />,
  );
}

describe("Welcome", () => {
  it("shows the hero for the most recent project with Continuar", async () => {
    mockApi({ getRecent: vi.fn().mockResolvedValue([ENTRY("/g.mocquereau", META), ENTRY("/d.mocquereau")]) });
    const onOpenRecent = vi.fn();
    renderWelcome({ onOpenRecent });
    expect(await screen.findByText("Gloria VIII")).toBeTruthy();
    expect(screen.getByText("P - AR Res. Ms. 016")).toBeTruthy();
    expect(screen.getByText("André Gaby · 27 de abril")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Continuar" }));
    expect(onOpenRecent).toHaveBeenCalledWith("/g.mocquereau");
    expect(screen.getByRole("button", { name: "Continuar" }).className).toContain("sc-btn--filled");
  });

  it("with recents, Abrir… and Novo projeto are elevated buttons in the top row", async () => {
    mockApi({ getRecent: vi.fn().mockResolvedValue([ENTRY("/g.mocquereau", META)]) });
    const onNew = vi.fn();
    const onOpen = vi.fn();
    renderWelcome({ onNew, onOpen });
    const novo = await screen.findByRole("button", { name: "Novo projeto" });
    expect(novo.className).toContain("sc-btn--elevated");
    fireEvent.click(novo);
    fireEvent.click(screen.getByRole("button", { name: "Abrir…" }));
    expect(onNew).toHaveBeenCalledOnce();
    expect(onOpen).toHaveBeenCalledOnce();
  });

  it("lists older entries as cards, falling back to the file name", async () => {
    mockApi({ getRecent: vi.fn().mockResolvedValue([ENTRY("/g.mocquereau", META), ENTRY("/x/Dominus dixit.mocquereau")]) });
    const onOpenRecent = vi.fn();
    renderWelcome({ onOpenRecent });
    fireEvent.click(await screen.findByRole("button", { name: /Dominus dixit/ }));
    expect(onOpenRecent).toHaveBeenCalledWith("/x/Dominus dixit.mocquereau");
  });

  it("shows at most 3 cards (one row) besides the hero", async () => {
    const entries = Array.from({ length: 9 }, (_, i) => ENTRY(`/p/Proj ${i}.mocquereau`));
    mockApi({ getRecent: vi.fn().mockResolvedValue(entries) });
    renderWelcome();
    await screen.findByRole("button", { name: /Proj 1/ });
    expect(screen.getByRole("button", { name: /Proj 3/ })).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Proj 4/ })).toBeNull();
  });

  it("omits an unparseable date", async () => {
    mockApi({ getRecent: vi.fn().mockResolvedValue([ENTRY("/g.mocquereau", { ...META, updatedAt: "nope" })]) });
    renderWelcome();
    expect(await screen.findByText("André Gaby")).toBeTruthy();
  });

  it("without recents shows the three start choices", async () => {
    mockApi({ getRecent: vi.fn().mockResolvedValue([]) });
    const onNew = vi.fn(),
      onOpen = vi.fn(),
      onOpenExample = vi.fn();
    renderWelcome({ onNew, onOpen, onOpenExample });
    fireEvent.click(await screen.findByRole("button", { name: "Novo projeto" }));
    fireEvent.click(screen.getByRole("button", { name: "Abrir…" }));
    fireEvent.click(screen.getByRole("button", { name: "Projeto de exemplo" }));
    expect(onNew).toHaveBeenCalled();
    expect(onOpen).toHaveBeenCalled();
    expect(onOpenExample).toHaveBeenCalled();
    expect(screen.queryByRole("button", { name: "Continuar" })).toBeNull();
  });

  it("renders neither version while recents are loading", () => {
    mockApi({ getRecent: vi.fn().mockReturnValue(new Promise(() => {})) });
    renderWelcome();
    expect(screen.queryByRole("button", { name: "Novo projeto" })).toBeNull();
    expect(screen.queryByRole("heading", { name: "Mocquereau" })).toBeNull();
  });

  it("a hero without thumbnail renders a placeholder, not a broken image", async () => {
    mockApi({ getRecent: vi.fn().mockResolvedValue([ENTRY("/g.mocquereau", { ...META, thumb: undefined })]) });
    renderWelcome();
    await screen.findByText("Gloria VIII");
    expect(document.querySelector("img")).toBeNull();
  });

  it("displayName tira pasta e extensão", () => {
    expect(displayName("/x/Puer natus est.mocquereau.json")).toBe("Puer natus est");
    expect(displayName("C:\\x\\Gloria IV.mocquereau")).toBe("Gloria IV");
    expect(displayName("outro.json")).toBe("outro.json");
  });

  it("seletor de idioma no canto: globo + endônimo atual, troca o idioma antes de abrir projeto", async () => {
    mockApi();
    renderWelcome();
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
    mockApi();
    renderWelcome();
    const picker = await screen.findByRole("button", { name: /Language/ });
    fireEvent.click(picker);
    fireEvent.keyDown(document.activeElement!, { key: "Escape" });
    expect(screen.queryByRole("menu")).toBeNull();
    expect(document.activeElement).toBe(picker);
  });

  it("shows a placeholder in hero and card when a recent has no thumbnail", async () => {
    mockApi({ getRecent: vi.fn().mockResolvedValue([ENTRY("/a.mocquereau.json"), ENTRY("/b.mocquereau.json")]) });
    const { container } = renderWelcome();
    await screen.findByText("a");
    expect(screen.getAllByTestId("recent-thumb-placeholder")).toHaveLength(2);
    expect(container.querySelector("img")).toBeNull();
  });

  it("swaps a thumbnail that fails to load for the placeholder", async () => {
    mockApi({
      getRecent: vi.fn().mockResolvedValue([ENTRY("/g.mocquereau", META), ENTRY("/d.mocquereau", META)]),
    });
    const { container } = renderWelcome();
    await screen.findAllByText("Gloria VIII");
    const imgs = container.querySelectorAll("img");
    expect(imgs).toHaveLength(2);
    expect(screen.queryByTestId("recent-thumb-placeholder")).toBeNull();
    fireEvent.error(imgs[0]);
    fireEvent.error(imgs[1]);
    expect(screen.getAllByTestId("recent-thumb-placeholder")).toHaveLength(2);
    expect(container.querySelector("img")).toBeNull();
  });
});
