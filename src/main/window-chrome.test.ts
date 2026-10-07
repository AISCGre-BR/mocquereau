import { describe, it, expect } from "vitest";
import tokens from "parchment-design/tokens.json";
import {
  CHROME_COLORS,
  MENUBAR_HEIGHT,
  normalizeTheme,
  overlayFor,
  windowChromeOptions,
} from "./window-chrome";

type TokenFile = { color: { tokens: Array<{ name: string; value: Record<string, string> }> } };

function token(name: string, theme: "light" | "dark"): string {
  const found = (tokens as unknown as TokenFile).color.tokens.find((t) => t.name === name);
  if (!found) throw new Error(`token ${name} ausente`);
  return found.value[theme];
}

describe("cores do overlay", () => {
  it("seguem os tokens parchment e ink-soft do Parchment nos dois temas", () => {
    expect(CHROME_COLORS.light.color).toBe(token("parchment", "light"));
    expect(CHROME_COLORS.light.symbolColor).toBe(token("ink-soft", "light"));
    expect(CHROME_COLORS.dark.color).toBe(token("parchment", "dark"));
    expect(CHROME_COLORS.dark.symbolColor).toBe(token("ink-soft", "dark"));
  });

  it("overlayFor usa a altura da menubar", () => {
    expect(overlayFor(true)).toEqual({ ...CHROME_COLORS.dark, height: MENUBAR_HEIGHT });
    expect(MENUBAR_HEIGHT).toBe(30);
  });
});

describe("normalizeTheme", () => {
  it("aceita system, light e dark", () => {
    expect(normalizeTheme("system")).toBe("system");
    expect(normalizeTheme("light")).toBe("light");
    expect(normalizeTheme("dark")).toBe("dark");
  });

  it("valor inválido ou ausente cai para system", () => {
    expect(normalizeTheme("blue")).toBe("system");
    expect(normalizeTheme(undefined)).toBe("system");
    expect(normalizeTheme(42)).toBe("system");
  });
});

describe("windowChromeOptions", () => {
  it("Windows e Linux: barra escondida com overlay", () => {
    for (const platform of ["win32", "linux"] as const) {
      expect(windowChromeOptions(platform, false, false)).toEqual({
        titleBarStyle: "hidden",
        titleBarOverlay: overlayFor(false),
        backgroundColor: CHROME_COLORS.light.color,
      });
    }
  });

  it("macOS: hiddenInset com semáforos alinhados à menubar", () => {
    expect(windowChromeOptions("darwin", true, false)).toEqual({
      titleBarStyle: "hiddenInset",
      trafficLightPosition: { x: 12, y: 8 },
      backgroundColor: CHROME_COLORS.dark.color,
    });
  });

  it("moldura nativa forçada só define o fundo", () => {
    expect(windowChromeOptions("linux", false, true)).toEqual({ backgroundColor: CHROME_COLORS.light.color });
  });
});
