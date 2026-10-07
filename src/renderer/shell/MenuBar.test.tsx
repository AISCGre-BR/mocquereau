// @vitest-environment jsdom
import "../i18n";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MenuBar } from "./MenuBar";
import type { MenuDefinition } from "./menuTypes";

afterEach(cleanup);

function setup(platform = "linux", edited = false) {
  const onNew = vi.fn();
  const onSave = vi.fn();
  const onDark = vi.fn();
  const menus: MenuDefinition[] = [
    {
      id: "file",
      label: "Arquivo",
      items: [
        { id: "new", label: "Novo projeto", accelerator: "Ctrl+N", onSelect: onNew },
        "separator",
        { id: "save", label: "Salvar", accelerator: "Ctrl+S", disabled: true, onSelect: onSave },
      ],
    },
    { id: "view", label: "Exibir", items: [{ id: "dark", label: "Vigília (escuro)", checked: true, onSelect: onDark }] },
  ];
  const utils = render(<MenuBar menus={menus} title="Puer natus est" edited={edited} platform={platform} />);
  const top = (name: string) => screen.getByRole("menuitem", { name });
  const item = (text: RegExp) =>
    [...screen.queryAllByRole("menuitem"), ...screen.queryAllByRole("menuitemcheckbox")].find((el) =>
      text.test(el.textContent ?? ""),
    ) as HTMLElement | undefined;
  return { ...utils, menus, onNew, onSave, onDark, top, item };
}

describe("MenuBar", () => {
  it("mostra o título e '— Editado' só quando há alterações", () => {
    const { rerender, menus } = setup();
    expect(screen.getByText("Puer natus est")).toBeTruthy();
    expect(screen.queryByText("— Editado")).toBeNull();
    rerender(<MenuBar menus={menus} title="Puer natus est" edited platform="linux" />);
    expect(screen.getByText("— Editado")).toBeTruthy();
  });

  it("clique abre o menu; item chama onSelect e fecha", () => {
    const { top, item, onNew } = setup();
    fireEvent.click(top("Arquivo"));
    expect(screen.getByRole("menu", { name: "Arquivo" })).toBeTruthy();
    expect(item(/Novo projeto/)?.textContent).toContain("Ctrl+N");
    fireEvent.click(item(/Novo projeto/)!);
    expect(onNew).toHaveBeenCalledOnce();
    expect(screen.queryByRole("menu")).toBeNull();
  });

  it("item desabilitado não dispara", () => {
    const { top, item, onSave } = setup();
    fireEvent.click(top("Arquivo"));
    fireEvent.click(item(/Salvar/)!);
    expect(onSave).not.toHaveBeenCalled();
  });

  it("com um menu aberto, passar o mouse em outro troca", () => {
    const { top } = setup();
    fireEvent.click(top("Arquivo"));
    fireEvent.mouseEnter(top("Exibir"));
    expect(screen.getByRole("menu", { name: "Exibir" })).toBeTruthy();
    expect(screen.queryByRole("menu", { name: "Arquivo" })).toBeNull();
  });

  it("seta para a direita no menu abre o próximo; Escape fecha e devolve o foco", () => {
    const { top } = setup();
    fireEvent.click(top("Arquivo"));
    fireEvent.keyDown(document.activeElement!, { key: "ArrowRight" });
    expect(screen.getByRole("menu", { name: "Exibir" })).toBeTruthy();
    fireEvent.keyDown(document.activeElement!, { key: "Escape" });
    expect(screen.queryByRole("menu")).toBeNull();
    expect(document.activeElement).toBe(top("Exibir"));
  });

  it("seta para baixo no botão do topo abre e foca o primeiro item", () => {
    const { top, item } = setup();
    top("Arquivo").focus();
    fireEvent.keyDown(top("Arquivo"), { key: "ArrowDown" });
    expect(document.activeElement).toBe(item(/Novo projeto/));
  });

  it("clique fora fecha", () => {
    const { top } = setup();
    fireEvent.click(top("Arquivo"));
    fireEvent.pointerDown(document.body);
    expect(screen.queryByRole("menu")).toBeNull();
  });

  it("Alt sozinho foca o primeiro menu no Windows/Linux, não no macOS", () => {
    const { top, unmount } = setup("linux");
    fireEvent.keyDown(window, { key: "Alt" });
    fireEvent.keyUp(window, { key: "Alt" });
    expect(document.activeElement).toBe(top("Arquivo"));
    unmount();
    const mac = setup("darwin");
    fireEvent.keyDown(window, { key: "Alt" });
    fireEvent.keyUp(window, { key: "Alt" });
    expect(document.activeElement).not.toBe(mac.top("Arquivo"));
  });

  it("no macOS mostra atalhos com símbolos", () => {
    const { top, item } = setup("darwin");
    fireEvent.click(top("Arquivo"));
    expect(item(/Novo projeto/)?.textContent).toContain("⌘N");
  });
});
