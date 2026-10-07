// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { Button } from "./Button";
import { IconButton } from "./IconButton";
import { Tooltip, TOOLTIP_DELAY_MS } from "./Tooltip";

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("Button", () => {
  it.each([
    ["filled", "sc-btn--filled"],
    ["elevated", "sc-btn--elevated"],
    ["tonal", "sc-btn--tonal"],
    ["danger", "sc-btn--danger"],
  ] as const)("variante %s aplica %s", (variant, cls) => {
    render(<Button variant={variant}>Salvar</Button>);
    const btn = screen.getByRole("button", { name: "Salvar" });
    expect(btn.className).toContain("sc-btn");
    expect(btn.className).toContain(cls);
  });

  it("variante text usa só sc-btn e type=button", () => {
    render(<Button>Mais</Button>);
    const btn = screen.getByRole("button", { name: "Mais" });
    expect(btn.className).toBe("sc-btn");
    expect(btn.getAttribute("type")).toBe("button");
  });

  it("desabilitado não dispara onClick", () => {
    const onClick = vi.fn();
    render(<Button disabled onClick={onClick}>Exportar</Button>);
    fireEvent.click(screen.getByRole("button", { name: "Exportar" }));
    expect(onClick).not.toHaveBeenCalled();
  });

  it("renderiza o ícone antes do rótulo", () => {
    render(<Button icon={<svg data-testid="ic" />}>Novo</Button>);
    const btn = screen.getByRole("button", { name: "Novo" });
    expect(btn.firstElementChild?.getAttribute("data-testid")).toBe("ic");
  });
});

describe("IconButton e Tooltip", () => {
  it("tem rótulo acessível e reflete aria-pressed", () => {
    render(<IconButton label="Desenhar caixa" icon={<svg />} pressed onClick={() => {}} />);
    const btn = screen.getByRole("button", { name: "Desenhar caixa" });
    expect(btn.getAttribute("aria-pressed")).toBe("true");
    expect(btn.className).toContain("sc-btn--icon");
  });

  it("mostra o tooltip com o atalho só depois de 500 ms e some ao sair", () => {
    vi.useFakeTimers();
    render(<IconButton label="Desfazer" shortcut="Ctrl+Z" icon={<svg />} />);
    const btn = screen.getByRole("button", { name: "Desfazer" });
    fireEvent.mouseEnter(btn);
    act(() => {
      vi.advanceTimersByTime(TOOLTIP_DELAY_MS - 1);
    });
    expect(screen.queryByRole("tooltip")).toBeNull();
    act(() => {
      vi.advanceTimersByTime(1);
    });
    const tip = screen.getByRole("tooltip");
    expect(tip.textContent).toContain("Desfazer");
    expect(tip.textContent).toContain("Ctrl+Z");
    fireEvent.mouseLeave(btn);
    expect(screen.queryByRole("tooltip")).toBeNull();
  });

  it("Tooltip envolve qualquer conteúdo", () => {
    vi.useFakeTimers();
    render(
      <Tooltip label="Caminho completo">
        <span>Puer</span>
      </Tooltip>,
    );
    fireEvent.mouseEnter(screen.getByText("Puer").parentElement!);
    act(() => {
      vi.advanceTimersByTime(TOOLTIP_DELAY_MS);
    });
    expect(screen.getByRole("tooltip").textContent).toBe("Caminho completo");
  });
});
