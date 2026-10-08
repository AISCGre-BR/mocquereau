// @vitest-environment jsdom
import "../../i18n";
import { useState } from "react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { TabelaTools } from "./TabelaTools";
import { TableZoomProvider, useTableZoomShortcuts } from "../../hooks/useTableZoom";

/** Stand-in for the Tabela view: the shortcuts live with the table. */
function TableStub() {
  useTableZoomShortcuts();
  return null;
}

function Harness() {
  const [tabela, setTabela] = useState(false);
  return (
    <TableZoomProvider>
      <TabelaTools />
      <button type="button" onClick={() => setTabela((v) => !v)}>
        alternar vista
      </button>
      {tabela && <TableStub />}
    </TableZoomProvider>
  );
}

const value = () => screen.getByRole("button", { name: /Zoom atual/ }).textContent;

beforeEach(() => {
  window.mocquereau = { platform: "linux" } as never;
});
afterEach(cleanup);

describe("TabelaTools", () => {
  it("− e + andam pelos níveis; o valor reinicia o zoom; os extremos desabilitam o botão", () => {
    render(<Harness />);
    expect(value()).toBe("100%");
    const zoomIn = screen.getByRole("button", { name: "Aumentar zoom" });
    const zoomOut = screen.getByRole("button", { name: "Diminuir zoom" });
    fireEvent.click(zoomIn);
    expect(value()).toBe("125%");
    fireEvent.click(zoomIn);
    expect(value()).toBe("150%");
    expect((zoomIn as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: /Zoom atual/ }));
    expect(value()).toBe("100%");
    fireEvent.click(zoomOut);
    fireEvent.click(zoomOut);
    expect(value()).toBe("50%");
    expect((zoomOut as HTMLButtonElement).disabled).toBe(true);
  });

  it("o valor usa algarismos tabulares", () => {
    render(<Harness />);
    expect(screen.getByRole("button", { name: /Zoom atual/ }).className).toContain("tabular-nums");
  });

  it("os atalhos de zoom não agem fora da Tabela", () => {
    render(<Harness />);
    fireEvent.keyDown(window, { key: "=", ctrlKey: true });
    fireEvent.keyDown(window, { key: "-", ctrlKey: true });
    expect(value()).toBe("100%");
    fireEvent.click(screen.getByRole("button", { name: "alternar vista" }));
    fireEvent.keyDown(window, { key: "=", ctrlKey: true });
    expect(value()).toBe("125%");
    fireEvent.click(screen.getByRole("button", { name: "alternar vista" }));
    fireEvent.keyDown(window, { key: "0", code: "Digit0", ctrlKey: true });
    expect(value()).toBe("125%");
  });
});
