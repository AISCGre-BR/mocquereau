// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { SegmentedControl, type SegmentOption } from "./SegmentedControl";

afterEach(cleanup);

type View = "texto" | "fontes" | "recortes" | "tabela";
const VIEWS: SegmentOption<View>[] = [
  { value: "texto", label: "Texto" },
  { value: "fontes", label: "Fontes" },
  { value: "recortes", label: "Recortes", disabled: true },
  { value: "tabela", label: "Tabela" },
];

describe("SegmentedControl (tabs)", () => {
  it("marca o selecionado e usa tabindex itinerante", () => {
    render(<SegmentedControl aria-label="Vistas" options={VIEWS} value="fontes" onChange={() => {}} />);
    expect(screen.getByRole("tablist", { name: "Vistas" })).toBeTruthy();
    const fontes = screen.getByRole("tab", { name: "Fontes" });
    expect(fontes.getAttribute("aria-selected")).toBe("true");
    expect(fontes.tabIndex).toBe(0);
    expect(screen.getByRole("tab", { name: "Texto" }).getAttribute("aria-selected")).toBe("false");
    expect(screen.getByRole("tab", { name: "Texto" }).tabIndex).toBe(-1);
  });

  it("clique chama onChange", () => {
    const onChange = vi.fn();
    render(<SegmentedControl aria-label="Vistas" options={VIEWS} value="texto" onChange={onChange} />);
    fireEvent.click(screen.getByRole("tab", { name: "Tabela" }));
    expect(onChange).toHaveBeenCalledWith("tabela");
  });

  it("seta para a direita pula o desabilitado e seleciona", () => {
    const onChange = vi.fn();
    render(<SegmentedControl aria-label="Vistas" options={VIEWS} value="fontes" onChange={onChange} />);
    const fontes = screen.getByRole("tab", { name: "Fontes" });
    fontes.focus();
    fireEvent.keyDown(fontes, { key: "ArrowRight" });
    expect(onChange).toHaveBeenCalledWith("tabela");
    expect(document.activeElement).toBe(screen.getByRole("tab", { name: "Tabela" }));
  });

  it("seta para a esquerda no primeiro volta ao último; Home vai ao primeiro", () => {
    const onChange = vi.fn();
    render(<SegmentedControl aria-label="Vistas" options={VIEWS} value="texto" onChange={onChange} />);
    const texto = screen.getByRole("tab", { name: "Texto" });
    texto.focus();
    fireEvent.keyDown(texto, { key: "ArrowLeft" });
    expect(onChange).toHaveBeenLastCalledWith("tabela");
    fireEvent.keyDown(document.activeElement!, { key: "Home" });
    expect(onChange).toHaveBeenLastCalledWith("texto");
  });
});

describe("SegmentedControl (toggle, só ícones)", () => {
  const TOOLS: SegmentOption<"draw" | "rotate">[] = [
    { value: "draw", label: "Desenhar caixa", icon: <svg />, shortcut: "B" },
    { value: "rotate", label: "Girar imagem", icon: <svg /> },
  ];

  it("usa toolbar, aria-pressed e aria-label; setas só movem o foco", () => {
    const onChange = vi.fn();
    render(<SegmentedControl aria-label="Ferramentas" mode="toggle" iconOnly options={TOOLS} value="draw" onChange={onChange} />);
    expect(screen.getByRole("toolbar", { name: "Ferramentas" })).toBeTruthy();
    const draw = screen.getByRole("button", { name: "Desenhar caixa" });
    expect(draw.getAttribute("aria-pressed")).toBe("true");
    expect(draw.className).toContain("is-icon");
    draw.focus();
    fireEvent.keyDown(draw, { key: "ArrowRight" });
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Girar imagem" }));
    expect(onChange).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Girar imagem" }));
    expect(onChange).toHaveBeenCalledWith("rotate");
  });
});
