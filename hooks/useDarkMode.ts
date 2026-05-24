// hooks/useDarkMode.ts
"use client";

import { useEffect, useState } from "react";

type Theme = "light" | "dark" | "system";

const KEY = "newshub-theme";

export function useDarkMode() {
  const [theme, setTheme] = useState<Theme>("system");
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const saved = (localStorage.getItem(KEY) as Theme) ?? "system";
    setTheme(saved);
    applyTheme(saved);
    setMounted(true);
  }, []);

  function applyTheme(t: Theme) {
    const html = document.documentElement;
    if (t === "dark")  { html.setAttribute("data-theme", "dark"); }
    else if (t === "light") { html.setAttribute("data-theme", "light"); }
    else { html.removeAttribute("data-theme"); }
  }

  function setAndSave(t: Theme) {
    setTheme(t);
    localStorage.setItem(KEY, t);
    applyTheme(t);
  }

  function toggle() {
    const next = theme === "dark" ? "light" : theme === "light" ? "system" : "dark";
    setAndSave(next);
  }

  return { theme, toggle, setTheme: setAndSave, mounted };
}
