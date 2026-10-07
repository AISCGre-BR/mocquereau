// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { Component, type ReactNode } from "react";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { Toaster, useToast, TOAST_AUTO_DISMISS_MS, type ToastInput } from "./Toast";

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

function Trigger({ input }: { input: ToastInput }) {
  const toast = useToast();
  return (
    <button type="button" onClick={() => toast.show(input)}>
      disparar
    </button>
  );
}

function renderWith(input: ToastInput) {
  render(
    <Toaster dismissLabel="Dispensar">
      <Trigger input={input} />
    </Toaster>,
  );
  fireEvent.click(screen.getByRole("button", { name: "disparar" }));
}

describe("Toast", () => {
  it("ok some sozinho em 4 s", () => {
    vi.useFakeTimers();
    renderWith({ kind: "ok", message: "Projeto salvo." });
    expect(screen.getByRole("status").textContent).toContain("Projeto salvo.");
    act(() => {
      vi.advanceTimersByTime(TOAST_AUTO_DISMISS_MS - 1);
    });
    expect(screen.queryByText("Projeto salvo.")).not.toBeNull();
    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(screen.queryByText("Projeto salvo.")).toBeNull();
  });

  it("erro persiste até ser dispensado", () => {
    vi.useFakeTimers();
    renderWith({ kind: "error", message: "Sem permissão para gravar nesta pasta." });
    act(() => {
      vi.advanceTimersByTime(60_000);
    });
    const alert = screen.getByRole("alert");
    expect(alert.className).toContain("sc-toast--error");
    fireEvent.click(screen.getByRole("button", { name: "Dispensar" }));
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("ação chama o callback e fecha o toast", () => {
    const onSelect = vi.fn();
    renderWith({ kind: "warn", message: "Recorte removido.", action: { label: "Desfazer", onSelect } });
    fireEvent.click(screen.getByRole("button", { name: "Desfazer" }));
    expect(onSelect).toHaveBeenCalledOnce();
    expect(screen.queryByText("Recorte removido.")).toBeNull();
  });

  it("useToast fora do Toaster lança", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    render(
      <Boundary>
        <Trigger input={{ kind: "ok", message: "x" }} />
      </Boundary>,
    );
    expect(screen.getByText("useToast precisa estar dentro de <Toaster>")).toBeTruthy();
  });
});

class Boundary extends Component<{ children: ReactNode }, { message: string | null }> {
  state = { message: null as string | null };
  static getDerivedStateFromError(error: Error) {
    return { message: error.message };
  }
  render() {
    return this.state.message ?? this.props.children;
  }
}
