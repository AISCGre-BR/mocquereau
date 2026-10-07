// @vitest-environment jsdom
import "../i18n";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { Toolbar } from "./Toolbar";

afterEach(cleanup);

describe("Toolbar", () => {
  it("seletor de vistas com a atual selecionada e troca por clique", () => {
    const onViewChange = vi.fn();
    render(<Toolbar view="recortes" onViewChange={onViewChange} />);
    expect(screen.getAllByRole("tab").map((t) => t.textContent)).toEqual(["Texto", "Fontes", "Recortes", "Tabela"]);
    expect(screen.getByRole("tab", { name: "Recortes" }).getAttribute("aria-selected")).toBe("true");
    fireEvent.click(screen.getByRole("tab", { name: "Tabela" }));
    expect(onViewChange).toHaveBeenCalledWith("tabela");
  });

  it("renderiza ferramentas e a ação principal à direita", () => {
    render(
      <Toolbar
        view="tabela"
        onViewChange={() => {}}
        tools={<button type="button">zoom</button>}
        primaryAction={<button type="button">Exportar DOCX…</button>}
      />,
    );
    const bar = screen.getByRole("toolbar", { name: "Barra de ferramentas" });
    const buttons = Array.from(bar.querySelectorAll("button")).map((b) => b.textContent);
    expect(buttons[buttons.length - 1]).toBe("Exportar DOCX…");
    expect(buttons).toContain("zoom");
  });
});
