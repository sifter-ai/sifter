import { useEffect, useState } from "react";

const KEY = "sifter_theme";
export type Theme = "light" | "dark" | "system";

function systemPrefersDark() {
  return window.matchMedia("(prefers-color-scheme: dark)").matches;
}

export function useDarkMode() {
  const [theme, setTheme] = useState<Theme>(() => {
    const stored = localStorage.getItem(KEY);
    if (stored === "light" || stored === "dark" || stored === "system") return stored;
    // Migrate legacy boolean key
    const legacy = localStorage.getItem("sifter_dark_mode");
    if (legacy !== null) return legacy === "true" ? "dark" : "light";
    return "system";
  });

  useEffect(() => {
    const apply = (isDark: boolean) =>
      document.documentElement.classList.toggle("dark", isDark);

    if (theme !== "system") {
      apply(theme === "dark");
      return;
    }

    apply(systemPrefersDark());
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const handler = (e: MediaQueryListEvent) => apply(e.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, [theme]);

  useEffect(() => {
    localStorage.setItem(KEY, theme);
  }, [theme]);

  const dark = theme === "dark" || (theme === "system" && systemPrefersDark());

  return { dark, theme, setTheme, toggle: () => setTheme((t) => (t === "dark" ? "light" : "dark")) };
}
