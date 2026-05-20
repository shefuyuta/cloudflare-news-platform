// hooks/useKeywordAlerts.ts
"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { NewsArticle } from "@/lib/types";

const KEYWORDS_KEY = "newshub-alert-keywords";
const SEEN_KEY = "newshub-alert-seen";

function loadArr(key: string): string[] {
  if (typeof window === "undefined") return [];
  try {
    return JSON.parse(localStorage.getItem(key) ?? "[]") as string[];
  } catch {
    return [];
  }
}

function saveArr(key: string, arr: string[]) {
  try {
    localStorage.setItem(key, JSON.stringify(arr));
  } catch {}
}

export function useKeywordAlerts(articles: NewsArticle[]) {
  const [keywords, setKeywords] = useState<string[]>([]);
  const [matches, setMatches] = useState<NewsArticle[]>([]);
  const [newCount, setNewCount] = useState(0);
  const [mounted, setMounted] = useState(false);
  const prevSeenRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    setKeywords(loadArr(KEYWORDS_KEY));
    prevSeenRef.current = new Set(loadArr(SEEN_KEY));
    setMounted(true);
  }, []);

  // Recompute matches when articles or keywords change
  useEffect(() => {
    if (!mounted || !keywords.length) {
      setMatches([]);
      setNewCount(0);
      return;
    }
    const lkw = keywords.map((k) => k.toLowerCase());
    const found = articles.filter((a) => {
      const haystack = [a.title, a.summary ?? "", ...a.tags].join(" ").toLowerCase();
      return lkw.some((k) => haystack.includes(k));
    });
    setMatches(found);
    const newMatches = found.filter((a) => !prevSeenRef.current.has(a.id));
    setNewCount(newMatches.length);
  }, [articles, keywords, mounted]);

  const addKeyword = useCallback((kw: string) => {
    const kw2 = kw.trim().toLowerCase();
    if (!kw2) return;
    setKeywords((prev) => {
      if (prev.includes(kw2)) return prev;
      const next = [...prev, kw2];
      saveArr(KEYWORDS_KEY, next);
      return next;
    });
  }, []);

  const removeKeyword = useCallback((kw: string) => {
    setKeywords((prev) => {
      const next = prev.filter((k) => k !== kw);
      saveArr(KEYWORDS_KEY, next);
      return next;
    });
  }, []);

  const dismissAlerts = useCallback(() => {
    const ids = matches.map((a) => a.id);
    prevSeenRef.current = new Set([...prevSeenRef.current, ...ids]);
    saveArr(SEEN_KEY, [...prevSeenRef.current]);
    setNewCount(0);
  }, [matches]);

  return { keywords, matches, newCount, addKeyword, removeKeyword, dismissAlerts, mounted };
}
