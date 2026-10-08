// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { Dialog } from "./Dialog";
import { Button } from "./Button";

afterEach(cleanup);

function ui(open: boolean, onClose = vi.fn(), onConfirm = vi.fn()) {
  return (
    <>
      <button type="button">fora</button>
      <Dialog
        open={open}
        title="Exportar DOCX"
        onClose={onClose}
        onConfirm={onConfirm}
        actions={
          <>
            <Button variant="elevated">Cancelar</Button>
            <Button variant="filled">Exportar</Button>
          </>
        }
      >
        <input aria-label="Nome" />
      </Dialog>
    </>
  );
}

describe("Dialog", () => {
  it("fechado não renderiza nada", () => {
    render(ui(false));
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("é modal, nomeado pelo título, e foca o primeiro campo", () => {
    render(ui(true));
    const dialog = screen.getByRole("dialog", { name: "Exportar DOCX" });
    expect(dialog.getAttribute("aria-modal")).toBe("true");
    expect(document.activeElement).toBe(screen.getByLabelText("Nome"));
  });

  it("prende o foco com Tab e Shift+Tab", () => {
    render(ui(true));
    const exportar = screen.getByRole("button", { name: "Exportar" });
    exportar.focus();
    fireEvent.keyDown(exportar, { key: "Tab" });
    expect(document.activeElement).toBe(screen.getByLabelText("Nome"));
    fireEvent.keyDown(document.activeElement!, { key: "Tab", shiftKey: true });
    expect(document.activeElement).toBe(exportar);
  });

  it("Esc cancela; Enter no campo confirma; Enter num botão não confirma", () => {
    const onClose = vi.fn();
    const onConfirm = vi.fn();
    render(ui(true, onClose, onConfirm));
    fireEvent.keyDown(screen.getByLabelText("Nome"), { key: "Enter" });
    expect(onConfirm).toHaveBeenCalledOnce();
    fireEvent.keyDown(screen.getByRole("button", { name: "Cancelar" }), { key: "Enter" });
    expect(onConfirm).toHaveBeenCalledOnce();
    fireEvent.keyDown(screen.getByLabelText("Nome"), { key: "Escape" });
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("clique no véu fecha", () => {
    const onClose = vi.fn();
    render(ui(true, onClose));
    fireEvent.mouseDown(screen.getByRole("dialog").parentElement!);
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("nenhuma tecla do diálogo chega aos atalhos globais", () => {
    render(ui(true));
    const globalKeys = vi.fn();
    window.addEventListener("keydown", globalKeys);
    fireEvent.keyDown(screen.getByLabelText("Nome"), { key: "Enter" });
    fireEvent.keyDown(screen.getByLabelText("Nome"), { key: "ArrowRight" });
    fireEvent.keyDown(screen.getByLabelText("Nome"), { key: "Delete" });
    window.removeEventListener("keydown", globalKeys);
    expect(globalKeys).not.toHaveBeenCalled();
  });

  it("devolve o foco ao elemento anterior ao fechar", () => {
    const { rerender } = render(ui(false));
    const fora = screen.getByRole("button", { name: "fora" });
    fora.focus();
    rerender(ui(true));
    expect(document.activeElement).toBe(screen.getByLabelText("Nome"));
    rerender(ui(false));
    expect(document.activeElement).toBe(fora);
  });

  it("header substitui o título visível; o diálogo continua nomeado pelo título", () => {
    render(
      <Dialog open title="Fonte" header={<input aria-label="Sigla" />} onClose={vi.fn()}>
        corpo
      </Dialog>,
    );
    expect(screen.getByRole("dialog", { name: "Fonte" })).toBeTruthy();
    expect(screen.queryByRole("heading")).toBeNull();
    expect(screen.getByRole("textbox", { name: "Sigla" })).toBeTruthy();
  });
});
