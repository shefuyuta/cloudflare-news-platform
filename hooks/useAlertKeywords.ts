// hooks/useAlertKeywords.ts
// Manages only the keyword list (no article matching).
// Used in Header to avoid passing an unstable empty array to useKeywordAlerts.
"use client";

import { useCallback, useEffect, useState } from "react";

const KEYWORDS_KEY = "newshub-alert-keywords";

function load(): string[] {
  if (typeof window === "undefined") return [];
  try { return JSON.parse(localStorage.getItem(KEYWORDS_KEY) ?? "[]") as string[]; }
  catch { return []; }
}
function save(arr: string[]) {
  try { localStorage.setItem(KEYWORDS_KEY, JSON.stringify(arr)); } catch {}
}

export function useAlertKeywords() {
  const [keywords, setKeywords] = useState<string[]>([]);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setKeywords(load());
    setMounted(true);
  }, []);

  const addKeyword = useCallback((kw: string) => {
    const kw2 = kw.trim().toLowerCase();
    if (!kw2) return;
    setKeywords(prev => {
      if (prev.includes(kw2)) return prev;
      const next = [...prev, kw2];
      save(next);
      return next;
    });
  }, []);

  const removeKeyword = useCallback((kw: string) => {
    setKeywords(prev => {
      const next = prev.filter(k => k !== kw);
      save(next);
      return next;
    });
  }, []);

  return { keywords, addKeyword, removeKeyword, mounted };
}
