// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { useTheme } from "./useTheme";
import type { MocquereauAPI } from "../lib/models";

afterEach(() => {
  cleanup();
  document.documentElement.removeAttribute("data-theme");
});

function mockApi(getTheme: () => Promise<unknown>) {
  const api = { getTheme: vi.fn(getTheme), setTheme: vi.fn().mockResolvedValue(true) };
  window.mocquereau = api as unknown as MocquereauAPI;
  return api;
}

describe("useTheme", () => {
  it("aplica o tema salvo (Vigília) no <html>", async () => {
    mockApi(() => Promise.resolve("dark"));
    const { result } = renderHook(() => useTheme());
    await waitFor(() => expect(result.current.theme).toBe("dark"));
    expect(document.documentElement.getAttribute("data-theme")).toBe("dark");
  });

  it("valor salvo inválido cai para Sistema (sem data-theme)", async () => {
    const api = mockApi(() => Promise.resolve("blue"));
    const { result } = renderHook(() => useTheme());
    await waitFor(() => expect(api.getTheme).toHaveBeenCalled());
    await act(async () => {});
    expect(result.current.theme).toBe("system");
    expect(document.documentElement.hasAttribute("data-theme")).toBe(false);
  });

  it("setTheme aplica e persiste; Sistema remove o atributo", async () => {
    const api = mockApi(() => Promise.resolve("light"));
    const { result } = renderHook(() => useTheme());
    await waitFor(() => expect(result.current.theme).toBe("light"));
    expect(document.documentElement.getAttribute("data-theme")).toBe("light");
    act(() => result.current.setTheme("system"));
    expect(document.documentElement.hasAttribute("data-theme")).toBe(false);
    expect(api.setTheme).toHaveBeenCalledWith("system");
  });

  it("escolha do usuário antes da leitura não é sobrescrita", async () => {
    let resolve: (value: unknown) => void = () => {};
    mockApi(() => new Promise((r) => (resolve = r)));
    const { result } = renderHook(() => useTheme());
    act(() => result.current.setTheme("dark"));
    await act(async () => resolve("light"));
    expect(result.current.theme).toBe("dark");
    expect(document.documentElement.getAttribute("data-theme")).toBe("dark");
  });
});
