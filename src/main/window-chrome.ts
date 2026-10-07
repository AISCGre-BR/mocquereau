// Moldura da janela: barra de título nativa escondida, com a menubar React
// ocupando a faixa de 30px. Cores do overlay vêm dos tokens do Parchment
// (parchment / ink-soft), conferidas por window-chrome.test.ts contra tokens.json.
import type { BrowserWindowConstructorOptions } from "electron";

export type ThemePreference = "system" | "light" | "dark";

export const MENUBAR_HEIGHT = 30;

export const CHROME_COLORS = {
  light: { color: "#f6f1e7", symbolColor: "#3d342a" },
  dark: { color: "#1a1613", symbolColor: "#d4c8b2" },
} as const;

export function normalizeTheme(value: unknown): ThemePreference {
  return value === "light" || value === "dark" || value === "system" ? value : "system";
}

export function overlayFor(dark: boolean): { color: string; symbolColor: string; height: number } {
  const colors = dark ? CHROME_COLORS.dark : CHROME_COLORS.light;
  return { color: colors.color, symbolColor: colors.symbolColor, height: MENUBAR_HEIGHT };
}

export function windowChromeOptions(
  platform: NodeJS.Platform,
  dark: boolean,
  nativeFrame: boolean,
): Pick<BrowserWindowConstructorOptions, "titleBarStyle" | "titleBarOverlay" | "trafficLightPosition" | "backgroundColor"> {
  const backgroundColor = dark ? CHROME_COLORS.dark.color : CHROME_COLORS.light.color;
  if (nativeFrame) return { backgroundColor };
  if (platform === "darwin") {
    return { titleBarStyle: "hiddenInset", trafficLightPosition: { x: 12, y: 8 }, backgroundColor };
  }
  return { titleBarStyle: "hidden", titleBarOverlay: overlayFor(dark), backgroundColor };
}

/**
 * Decide se a janela usa a moldura nativa em vez da barra escondida com overlay.
 *
 * - MOCQUEREAU_NATIVE_FRAME=1 força a moldura nativa; =0 força o overlay.
 * - macOS e Windows: overlay (sempre suportado).
 * - Linux: o titleBarOverlay depende da sessão gráfica. Sem XDG_SESSION_TYPE
 *   reconhecido ("x11" ou "wayland") não há como saber se o ambiente compõe a
 *   janela sem moldura direito (startx sem gerenciador de sessão, WSLg, alguns
 *   WMs mínimos): nesses casos, ou sob WSL, cai para a moldura nativa, que sempre
 *   funciona. A menubar React continua abaixo da barra nativa.
 */
export function shouldUseNativeFrame(
  platform: NodeJS.Platform,
  env: Record<string, string | undefined>,
): boolean {
  const override = env.MOCQUEREAU_NATIVE_FRAME;
  if (override === "1") return true;
  if (override === "0") return false;
  if (platform !== "linux") return false;
  if (env.WSL_DISTRO_NAME) return true;
  const session = (env.XDG_SESSION_TYPE ?? "").trim().toLowerCase();
  return session !== "x11" && session !== "wayland";
}
