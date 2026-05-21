// hooks/useBookmarks.ts
"use client";

import { useCallback, useEffect, useRef, useState } from "react";

const BOOKMARKS_KEY = "newshub-bookmarks";
const READ_KEY      = "newshub-read";

function loadSet(key: string): Set<string> {
  if (typeof window === "undefined") return new Set();
  try {
    const raw = localStorage.getItem(key);
    return raw ? new Set(JSON.parse(raw) as string[]) : new Set();
  } catch { return new Set(); }
}

function saveSet(key: string, set: Set<string>) {
  try { localStorage.setItem(key, JSON.stringify([...set])); } catch {}
}

export function useBookmarks() {
  const [bookmarks, setBookmarks] = useState<Set<string>>(new Set());
  const [read, setRead]           = useState<Set<string>>(new Set());
  const [mounted, setMounted]     = useState(false);

  // Use refs so callbacks never become stale
  const bookmarksRef = useRef(bookmarks);
  const readRef      = useRef(read);
  bookmarksRef.current = bookmarks;
  readRef.current      = read;

  useEffect(() => {
    setBookmarks(loadSet(BOOKMARKS_KEY));
    setRead(loadSet(READ_KEY));
    setMounted(true);
  }, []);

  const toggleBookmark = useCallback((id: string) => {
    setBookmarks(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      saveSet(BOOKMARKS_KEY, next);
      return next;
    });
  }, []);

  // markRead works even before mounted — safe because localStorage is write-only here
  const markRead = useCallback((id: string) => {
    setRead(prev => {
      if (prev.has(id)) return prev;          // bail out — no re-render needed
      const next = new Set(prev);
      next.add(id);
      saveSet(READ_KEY, next);
      return next;
    });
  }, []);

  const isBookmarked = useCallback((id: string) => bookmarksRef.current.has(id), []);
  const isRead       = useCallback((id: string) => readRef.current.has(id),      []);

  return { isBookmarked, isRead, toggleBookmark, markRead, mounted };
}
