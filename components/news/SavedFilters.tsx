// components/news/SavedFilters.tsx
"use client";

import { useState, useEffect } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { Bookmark } from "@/components/ui/Icon";
import { useLang } from "@/components/LangProvider";

const MAX_SAVED = 3;
const STORAGE_KEY = "newshub-saved-filters";

interface SavedFilter {
  id: string;       // pathname + query string, doubles as a stable key
  label: string;     // short auto-generated summary of the query string
  pathname: string;
  query: string;      // full query string, e.g. "tag=Qilin&hours=168"
  savedAt: string;
}

type Store = Record<string, SavedFilter[]>; // keyed by pathname, up to MAX_SAVED each

function loadStore(): Store {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) as Store : {};
  } catch { return {}; }
}

function saveStore(store: Store) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(store)); } catch { /* storage unavailable — no-op */ }
}

/** Build a short human-readable label from a query string, e.g.
 *  "tag=Qilin&tag=incransom&hours=168" -> "Qilin +incransom · 7d". No
 *  attempt at full i18n of every param name — this is a personal shortcut
 *  label the person who saved it will recognize, not a public-facing string. */
function summarize(query: string, ja: boolean): string {
  const sp = new URLSearchParams(query);
  const parts: string[] = [];
  const tags = sp.getAll("tag");
  if (tags.length) parts.push(tags.length > 1 ? `${tags[0]} +${tags.length - 1}` : tags[0]);
  const region = sp.get("region"); if (region) parts.push(region);
  const subcategory = sp.get("subcategory"); if (subcategory) parts.push(subcategory);
  const q = sp.get("q"); if (q) parts.push(`"${q.slice(0, 16)}"`);
  const hours = sp.get("hours");
  if (hours) {
    const h = parseInt(hours, 10);
    parts.push(h >= 24 ? `${Math.round(h / 24)}d` : `${h}h`);
  }
  const label = parts.join(" · ");
  return label || (ja ? "（フィルタなし）" : "(no filters)");
}

export function SavedFilters() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { lang } = useLang();
  const ja = lang === "ja";

  const [store, setStore] = useState<Store | null>(null); // null until loaded (avoids SSR/client mismatch flash)
  useEffect(() => { setStore(loadStore()); }, []);

  if (store === null) return null; // nothing to show until localStorage is read client-side
  const currentStore = store; // TS can't narrow `store` across the closures below

  const saved = store[pathname] ?? [];
  const currentQuery = searchParams.toString();
  const alreadySaved = saved.some(f => f.query === currentQuery);
  const hasAnyFilter = currentQuery.length > 0;

  function persist(next: Store) {
    saveStore(next);
    setStore(next);
  }

  function saveCurrent() {
    if (!hasAnyFilter || alreadySaved) return;
    const entry: SavedFilter = {
      id: `${pathname}?${currentQuery}`,
      label: summarize(currentQuery, ja),
      pathname,
      query: currentQuery,
      savedAt: new Date().toISOString(),
    };
    const existing = currentStore[pathname] ?? [];
    // Oldest drops off once at the cap — keeps this a lightweight shortcut
    // list, not a growing archive.
    const next = [entry, ...existing].slice(0, MAX_SAVED);
    persist({ ...currentStore, [pathname]: next });
  }

  function removeSaved(id: string) {
    const next = (currentStore[pathname] ?? []).filter(f => f.id !== id);
    persist({ ...currentStore, [pathname]: next });
  }

  function applySaved(f: SavedFilter) {
    router.push(`${f.pathname}?${f.query}`);
  }

  if (saved.length === 0 && !hasAnyFilter) return null; // nothing to show or save yet

  return (
    <div className="flex items-center gap-1.5 flex-wrap mb-3">
      {saved.map(f => (
        <span key={f.id} className="inline-flex items-center gap-1 rounded-full ring-1 ring-inset ring-[var(--line)] overflow-hidden">
          <button
            onClick={() => applySaved(f)}
            className="pl-2.5 pr-1.5 py-1 text-[11px] text-[var(--ink-2)] hover:bg-[var(--line-soft)] transition-colors"
            title={ja ? "このフィルタを適用" : "Apply this filter"}
          >
            {f.label}
          </button>
          <button
            onClick={() => removeSaved(f.id)}
            className="pr-2.5 pl-1.5 py-1 min-h-[36px] min-w-[32px] text-[var(--ink-4)] hover:text-[var(--ink)] transition-colors"
            title={ja ? "削除" : "Remove"}
          >
            ×
          </button>
        </span>
      ))}

      {hasAnyFilter && !alreadySaved && saved.length < MAX_SAVED && (
        <button
          onClick={saveCurrent}
          className="inline-flex items-center gap-1 text-[11px] text-[var(--ink-3)] hover:text-[var(--ink)] px-2 py-1 rounded-full ring-1 ring-inset ring-[var(--line)] ring-dashed hover:bg-[var(--line-soft)] transition-colors"
          title={ja ? "現在のフィルタを保存" : "Save current filter"}
        >
          <Bookmark size={11} strokeWidth={1.5} />
          {ja ? "この条件を保存" : "Save this filter"}
        </button>
      )}
    </div>
  );
}
