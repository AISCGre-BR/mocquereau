import { useCallback, useEffect, useRef, useState } from "react";
import type { ThemePreference } from "../lib/models";

/** data-theme no <html>: "light" (Pergaminho), "dark" (Vigília); ausente = sistema. */
export function applyThemeAttribute(theme: ThemePreference, root: HTMLElement = document.documentElement): void {
  if (theme === "system") root.removeAttribute("data-theme");
  else root.setAttribute("data-theme", theme);
}

function normalize(value: unknown): ThemePreference {
  return value === "light" || value === "dark" ? value : "system";
}

/**
 * Tema persistido via window.mocquereau.getTheme/setTheme (electron-conf no main,
 * que também sincroniza nativeTheme.themeSource e as cores do overlay da janela).
 */
export function useTheme(): { theme: ThemePreference; setTheme: (theme: ThemePreference) => void } {
  const [theme, setThemeState] = useState<ThemePreference>("system");
  const userChose = useRef(false);

  useEffect(() => {
    let alive = true;
    window.mocquereau
      .getTheme()
      .then((stored) => {
        if (!alive || userChose.current) return;
        const value = normalize(stored);
        setThemeState(value);
        applyThemeAttribute(value);
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, []);

  const setTheme = useCallback((value: ThemePreference) => {
    userChose.current = true;
    setThemeState(value);
    applyThemeAttribute(value);
    void window.mocquereau.setTheme(value).catch(() => undefined);
  }, []);

  return { theme, setTheme };
}
