// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MenuItem, MenuSeparator, MenuSubmenu, MenuSurface } from "./Menu";

afterEach(cleanup);

function setup() {
  const onClose = vi.fn();
  const a = vi.fn();
  const b = vi.fn();
  const c = vi.fn();
  render(
    <MenuSurface aria-label="Arquivo" onClose={onClose}>
      <MenuItem label="Novo projeto" shortcut="Ctrl+N" onSelect={a} />
      <MenuItem label="Salvar" disabled onSelect={b} />
      <MenuSeparator />
      <MenuItem label="Vigília (escuro)" checked onSelect={c} />
    </MenuSurface>,
  );
  const item = (name: RegExp) =>
    [...screen.queryAllByRole("menuitem"), ...screen.queryAllByRole("menuitemcheckbox")].find((el) =>
      name.test(el.textContent ?? ""),
    ) as HTMLElement;
  return { onClose, a, b, c, item };
}

describe("Menu", () => {
  it("foca o primeiro item habilitado ao abrir", () => {
    const { item } = setup();
    expect(screen.getByRole("menu", { name: "Arquivo" })).toBeTruthy();
    expect(document.activeElement).toBe(item(/Novo projeto/));
  });

  it("setas pulam desabilitados e dão a volta; Home/End", () => {
    const { item } = setup();
    fireEvent.keyDown(document.activeElement!, { key: "ArrowDown" });
    expect(document.activeElement).toBe(item(/Vigília/));
    fireEvent.keyDown(document.activeElement!, { key: "ArrowDown" });
    expect(document.activeElement).toBe(item(/Novo projeto/));
    fireEvent.keyDown(document.activeElement!, { key: "ArrowUp" });
    expect(document.activeElement).toBe(item(/Vigília/));
    fireEvent.keyDown(document.activeElement!, { key: "Home" });
    expect(document.activeElement).toBe(item(/Novo projeto/));
    fireEvent.keyDown(document.activeElement!, { key: "End" });
    expect(document.activeElement).toBe(item(/Vigília/));
  });

  it("Enter seleciona: fecha com 'select' e chama onSelect", () => {
    const { onClose, c } = setup();
    fireEvent.keyDown(document.activeElement!, { key: "End" });
    fireEvent.keyDown(document.activeElement!, { key: "Enter" });
    expect(onClose).toHaveBeenCalledWith("select");
    expect(c).toHaveBeenCalledOnce();
  });

  it("Escape fecha com 'escape'; clique fora fecha com 'outside'", () => {
    const { onClose } = setup();
    fireEvent.keyDown(document.activeElement!, { key: "Escape" });
    expect(onClose).toHaveBeenLastCalledWith("escape");
    fireEvent.pointerDown(document.body);
    expect(onClose).toHaveBeenLastCalledWith("outside");
  });

  it("item marcado é menuitemcheckbox e mostra o atalho", () => {
    const { item } = setup();
    expect(item(/Vigília/).getAttribute("role")).toBe("menuitemcheckbox");
    expect(item(/Vigília/).getAttribute("aria-checked")).toBe("true");
    expect(item(/Novo projeto/).textContent).toContain("Ctrl+N");
  });

  it("item desabilitado não dispara", () => {
    const { b, item } = setup();
    fireEvent.click(item(/Salvar/));
    expect(b).not.toHaveBeenCalled();
  });

  it("teclas tratadas no menu não chegam aos atalhos globais (editor de recortes)", () => {
    setup();
    const globalKeys = vi.fn();
    window.addEventListener("keydown", globalKeys);
    fireEvent.keyDown(document.activeElement!, { key: "ArrowDown" });
    fireEvent.keyDown(document.activeElement!, { key: "Enter" });
    window.removeEventListener("keydown", globalKeys);
    expect(globalKeys).not.toHaveBeenCalled();
  });

  it("setas laterais delegam a navegação entre menus", () => {
    const onNavigateOut = vi.fn();
    render(
      <MenuSurface onClose={() => {}} onNavigateOut={onNavigateOut}>
        <MenuItem label="Texto" onSelect={() => {}} />
      </MenuSurface>,
    );
    fireEvent.keyDown(document.activeElement!, { key: "ArrowRight" });
    expect(onNavigateOut).toHaveBeenCalledWith("right");
  });

  describe("submenu", () => {
    function setupSub() {
      const onClose = vi.fn();
      const onNavigateOut = vi.fn();
      const pick = vi.fn();
      render(
        <MenuSurface aria-label="Exibir" onClose={onClose} onNavigateOut={onNavigateOut}>
          <MenuItem label="Texto" onSelect={() => {}} />
          <MenuSubmenu label="Idioma / Language" icon={<span data-testid="globe" />}>
            <MenuItem label="Português" checked={false} onSelect={() => pick("pt-BR")} />
            <MenuItem label="English" checked onSelect={() => pick("en")} />
          </MenuSubmenu>
        </MenuSurface>,
      );
      const trigger = () => screen.getByRole("menuitem", { name: /Idioma \/ Language/ });
      const sub = () => screen.queryByRole("menu", { name: "Idioma / Language" });
      return { onClose, onNavigateOut, pick, trigger, sub };
    }

    it("gatilho anuncia o submenu, mostra o ícone e começa fechado", () => {
      const { trigger, sub } = setupSub();
      expect(trigger().getAttribute("aria-haspopup")).toBe("menu");
      expect(trigger().getAttribute("aria-expanded")).toBe("false");
      expect(screen.getByTestId("globe")).toBeTruthy();
      expect(sub()).toBeNull();
    });

    it("setas do menu pai não entram nos itens do submenu", () => {
      const { trigger } = setupSub();
      fireEvent.keyDown(document.activeElement!, { key: "ArrowDown" });
      expect(document.activeElement).toBe(trigger());
      fireEvent.keyDown(document.activeElement!, { key: "ArrowDown" });
      expect(document.activeElement?.textContent).toContain("Texto");
    });

    it("seta para a direita abre e foca o primeiro item; esquerda fecha e volta ao gatilho", () => {
      const { trigger, sub, onNavigateOut, onClose } = setupSub();
      trigger().focus();
      fireEvent.keyDown(trigger(), { key: "ArrowRight" });
      expect(sub()).toBeTruthy();
      expect(trigger().getAttribute("aria-expanded")).toBe("true");
      expect(document.activeElement?.textContent).toContain("Português");
      fireEvent.keyDown(document.activeElement!, { key: "ArrowDown" });
      expect(document.activeElement?.textContent).toContain("English");
      fireEvent.keyDown(document.activeElement!, { key: "ArrowLeft" });
      expect(sub()).toBeNull();
      expect(document.activeElement).toBe(trigger());
      expect(onNavigateOut).not.toHaveBeenCalled();
      expect(onClose).not.toHaveBeenCalled();
    });

    it("Enter no gatilho abre; Escape fecha só o submenu", () => {
      const { trigger, sub, onClose } = setupSub();
      trigger().focus();
      fireEvent.keyDown(trigger(), { key: "Enter" });
      expect(sub()).toBeTruthy();
      fireEvent.keyDown(document.activeElement!, { key: "Escape" });
      expect(sub()).toBeNull();
      expect(document.activeElement).toBe(trigger());
      expect(onClose).not.toHaveBeenCalled();
    });

    it("escolher um item do submenu fecha o menu inteiro com 'select'", () => {
      const { trigger, pick, onClose } = setupSub();
      fireEvent.click(trigger());
      fireEvent.click(screen.getByRole("menuitemcheckbox", { name: /English/ }));
      expect(pick).toHaveBeenCalledWith("en");
      expect(onClose).toHaveBeenCalledWith("select");
    });

    it("passar o mouse abre o submenu", () => {
      const { trigger, sub } = setupSub();
      fireEvent.mouseEnter(trigger());
      expect(sub()).toBeTruthy();
    });
  });
});
