// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, renderHook } from "@testing-library/react";
import { useMenuShortcuts } from "./useMenuShortcuts";
import type { MenuDefinition } from "./menuTypes";

afterEach(cleanup);

const menus = (onSave: () => void, disabled = false): MenuDefinition[] => [
  {
    id: "file",
    label: "Arquivo",
    items: [{ id: "file.save", label: "Salvar", accelerator: "Ctrl+S", disabled, onSelect: onSave }],
  },
];

function press(key: string, init: KeyboardEventInit = {}) {
  const event = new KeyboardEvent("keydown", { key, cancelable: true, ...init });
  window.dispatchEvent(event);
  return event;
}

describe("useMenuShortcuts", () => {
  it("Ctrl+S chama o comando e impede o padrão", () => {
    const onSave = vi.fn();
    renderHook(() => useMenuShortcuts(menus(onSave)));
    const event = press("s", { ctrlKey: true });
    expect(onSave).toHaveBeenCalledOnce();
    expect(event.defaultPrevented).toBe(true);
  });

  it("comando desabilitado (ex.: sem projeto) não é chamado nem bloqueia a tecla", () => {
    const onSave = vi.fn();
    renderHook(() => useMenuShortcuts(menus(onSave, true)));
    const event = press("s", { ctrlKey: true });
    expect(onSave).not.toHaveBeenCalled();
    expect(event.defaultPrevented).toBe(false);
  });

  it("tecla sem Ctrl/Cmd é ignorada", () => {
    const onSave = vi.fn();
    renderHook(() => useMenuShortcuts(menus(onSave)));
    press("s");
    expect(onSave).not.toHaveBeenCalled();
  });

  it("usa sempre os menus mais recentes", () => {
    const first = vi.fn();
    const second = vi.fn();
    const { rerender } = renderHook(({ fn }) => useMenuShortcuts(menus(fn)), { initialProps: { fn: first } });
    rerender({ fn: second });
    press("s", { ctrlKey: true });
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledOnce();
  });

  it("atalho extra (Ctrl+Y) chama o mesmo comando", () => {
    const onRedo = vi.fn();
    renderHook(() =>
      useMenuShortcuts([
        { id: "edit", label: "Editar", items: [{ id: "edit.redo", label: "Refazer", accelerator: "Ctrl+Shift+Z", altAccelerators: ["Ctrl+Y"], onSelect: onRedo }] },
      ]),
    );
    press("y", { ctrlKey: true });
    press("Z", { ctrlKey: true, shiftKey: true });
    expect(onRedo).toHaveBeenCalledTimes(2);
  });

  it("comando nativo em campo de texto: Ctrl+Z num textarea fica com o campo", () => {
    const onUndo = vi.fn();
    renderHook(() =>
      useMenuShortcuts([
        { id: "edit", label: "Editar", items: [{ id: "edit.undo", label: "Desfazer", accelerator: "Ctrl+Z", nativeInTextInput: true, onSelect: onUndo }] },
      ]),
    );
    const area = document.createElement("textarea");
    document.body.appendChild(area);
    const inField = new KeyboardEvent("keydown", { key: "z", ctrlKey: true, bubbles: true, cancelable: true });
    area.dispatchEvent(inField);
    expect(onUndo).not.toHaveBeenCalled();
    expect(inField.defaultPrevented).toBe(false);
    press("z", { ctrlKey: true });
    expect(onUndo).toHaveBeenCalledOnce();
    area.remove();
  });

  it("tecla segurada (repeat) não repete o comando, salvo os marcados allowRepeat", () => {
    const onSave = vi.fn();
    const onUndo = vi.fn();
    renderHook(() =>
      useMenuShortcuts([
        ...menus(onSave),
        { id: "edit", label: "Editar", items: [{ id: "edit.undo", label: "Desfazer", accelerator: "Ctrl+Z", allowRepeat: true, onSelect: onUndo }] },
      ]),
    );
    press("s", { ctrlKey: true });
    const repeated = press("s", { ctrlKey: true, repeat: true });
    expect(onSave).toHaveBeenCalledOnce();
    expect(repeated.defaultPrevented).toBe(true);
    press("z", { ctrlKey: true });
    press("z", { ctrlKey: true, repeat: true });
    expect(onUndo).toHaveBeenCalledTimes(2);
  });

  it("com um menu aberto nenhum atalho dispara", () => {
    const onSave = vi.fn();
    renderHook(() => useMenuShortcuts(menus(onSave)));
    const menu = document.createElement("div");
    menu.setAttribute("role", "menu");
    document.body.appendChild(menu);
    press("s", { ctrlKey: true });
    expect(onSave).not.toHaveBeenCalled();
    menu.remove();
    press("s", { ctrlKey: true });
    expect(onSave).toHaveBeenCalledOnce();
  });

  it("acha atalhos dentro de submenus", () => {
    const onPick = vi.fn();
    renderHook(() =>
      useMenuShortcuts([
        {
          id: "view",
          label: "Exibir",
          items: [{ id: "sub", label: "Sub", items: [{ id: "x", label: "X", accelerator: "Ctrl+K", onSelect: onPick }] }],
        },
      ]),
    );
    press("k", { ctrlKey: true });
    expect(onPick).toHaveBeenCalledOnce();
  });
});
