// components/search/SearchFilters.tsx
"use client";

import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { useState } from "react";
import { useLang } from "@/components/LangProvider";
import { useBookmarks } from "@/hooks/useBookmarks";
import type { NewsArticle } from "@/lib/types";
import { X } from "@/components/ui/Icon";

const TIME_OPTIONS = [
  { label: "2h",      value: "2" },
  { label: "24h",     value: "24" },
  { label: "48h",     value: "48" },
  { label: "72h",     value: "72" },
  { label: "1w",      value: "168" },
  { label: "全期間",  value: "all" },
] as const;

const CATEGORIES = [
  { value: "general",       labelJa: "一般",           labelEn: "General" },
  { value: "cybersecurity", labelJa: "サイバー",        labelEn: "Cybersecurity" },
  { value: "ai",            labelJa: "AI",              labelEn: "AI" },
] as const;

interface Props {
  articles: NewsArticle[];           // full result set from server
  children: (filtered: NewsArticle[]) => React.ReactNode;
}

/**
 * Wraps search results with client-side filters.
 * Server-side filters (category, source, q, hours) update the URL.
 * Client-side filters (read/unread) apply to the already-fetched results.
 */
export function SearchFilters({ articles, children }: Props) {
  const { lang } = useLang();
  const router   = useRouter();
  const pathname = usePathname();
  const params   = useSearchParams();
  const { isRead, mounted } = useBookmarks();

  // Client-side read filter state
  const [readFilter, setReadFilter] = useState<"all" | "unread" | "read">("all");

  function updateParam(key: string, value: string | null) {
    const sp = new URLSearchParams(params);
    if (value === null || value === "") sp.delete(key);
    else sp.set(key, value);
    router.push(`${pathname}?${sp.toString()}`);
  }

  const currentHours   = params.get("hours") ?? "all";
  const currentCat     = params.get("category") ?? "";
  const currentSource  = params.get("source") ?? "";
  const [sourceInput, setSourceInput] = useState(currentSource);

  // Apply client-side read filter
  const filtered = mounted && readFilter !== "all"
    ? articles.filter(a => readFilter === "read" ? isRead(a.id) : !isRead(a.id))
    : articles;

  const hasServerFilters = currentHours !== "all" || currentCat || currentSource || params.get("q");

  return (
    <div>
      {/* ── Filter bar ───────────────────────────────────────────────── */}
      <div className="mb-6 space-y-3">
        {/* Row 1: Time range */}
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-[10px] uppercase tracking-widest text-[var(--ink-4)] w-16 flex-shrink-0">
            {lang === "ja" ? "期間" : "Period"}
          </span>
          <div className="flex gap-1 flex-wrap">
            {TIME_OPTIONS.map(opt => (
              <button
                key={opt.value}
                onClick={() => updateParam("hours", opt.value === "all" ? null : opt.value)}
                className={[
                  "px-2.5 py-1 text-[11px] font-medium rounded-md transition-colors",
                  currentHours === opt.value || (opt.value === "all" && !params.get("hours"))
                    ? "bg-[var(--ink)] text-ink-contrast"
                    : "text-[var(--ink-3)] hover:bg-[var(--line-soft)] ring-1 ring-inset ring-[var(--line)]",
                ].join(" ")}
              >
                {opt.value === "all" ? (lang === "ja" ? "全期間" : "All time") : opt.label}
              </button>
            ))}
          </div>
        </div>

        {/* Row 2: Category */}
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-[10px] uppercase tracking-widest text-[var(--ink-4)] w-16 flex-shrink-0">
            {lang === "ja" ? "種別" : "Category"}
          </span>
          <div className="flex gap-1 flex-wrap">
            <button
              onClick={() => updateParam("category", null)}
              className={[
                "px-2.5 py-1 text-[11px] font-medium rounded-md transition-colors",
                !currentCat
                  ? "bg-[var(--ink)] text-ink-contrast"
                  : "text-[var(--ink-3)] hover:bg-[var(--line-soft)] ring-1 ring-inset ring-[var(--line)]",
              ].join(" ")}
            >
              {lang === "ja" ? "すべて" : "All"}
            </button>
            {CATEGORIES.map(c => (
              <button
                key={c.value}
                onClick={() => updateParam("category", currentCat === c.value ? null : c.value)}
                className={[
                  "px-2.5 py-1 text-[11px] font-medium rounded-md transition-colors",
                  currentCat === c.value
                    ? "bg-[var(--ink)] text-ink-contrast"
                    : "text-[var(--ink-3)] hover:bg-[var(--line-soft)] ring-1 ring-inset ring-[var(--line)]",
                ].join(" ")}
              >
                {lang === "ja" ? c.labelJa : c.labelEn}
              </button>
            ))}
          </div>
        </div>

        {/* Row 3: Source + read/unread */}
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-[10px] uppercase tracking-widest text-[var(--ink-4)] w-16 flex-shrink-0">
            {lang === "ja" ? "ソース" : "Source"}
          </span>
          <form
            onSubmit={e => { e.preventDefault(); updateParam("source", sourceInput.trim() || null); }}
            className="flex gap-1.5"
          >
            <div className="relative">
              <input
                value={sourceInput}
                onChange={e => setSourceInput(e.target.value)}
                placeholder={lang === "ja" ? "例: Reuters" : "e.g. Reuters"}
                className="text-[11px] bg-[var(--line-soft)] px-3 py-1.5 rounded-md outline-none focus:ring-1 ring-[var(--ink)] pr-6 w-36"
              />
              {sourceInput && (
                <button
                  type="button"
                  onClick={() => { setSourceInput(""); updateParam("source", null); }}
                  className="absolute right-1.5 top-1/2 -translate-y-1/2 text-[var(--ink-4)] hover:text-[var(--ink)]"
                >
                  <X size={10} />
                </button>
              )}
            </div>
            <button
              type="submit"
              className="px-2.5 py-1.5 text-[11px] font-medium rounded-md bg-[var(--ink)] text-ink-contrast"
            >
              {lang === "ja" ? "絞込" : "Filter"}
            </button>
          </form>

          {/* Read/unread filter (client-side, uses localStorage) */}
          {mounted && (
            <div className="flex gap-1 ml-2">
              {(["all", "unread", "read"] as const).map(v => (
                <button
                  key={v}
                  onClick={() => setReadFilter(v)}
                  className={[
                    "px-2.5 py-1 text-[11px] font-medium rounded-md transition-colors",
                    readFilter === v
                      ? "bg-[var(--ink)] text-ink-contrast"
                      : "text-[var(--ink-3)] hover:bg-[var(--line-soft)] ring-1 ring-inset ring-[var(--line)]",
                  ].join(" ")}
                >
                  {v === "all"    ? (lang === "ja" ? "すべて" : "All")
                  : v === "unread" ? (lang === "ja" ? "未読"   : "Unread")
                  :                  (lang === "ja" ? "既読"   : "Read")}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Active filter chips — quick remove */}
        {hasServerFilters && (
          <div className="flex flex-wrap gap-1.5 pt-1">
            {params.get("q") && (
              <Chip label={`"${params.get("q")}"`} onRemove={() => updateParam("q", null)} />
            )}
            {currentCat && (
              <Chip label={currentCat} onRemove={() => updateParam("category", null)} />
            )}
            {currentSource && (
              <Chip label={currentSource} onRemove={() => { setSourceInput(""); updateParam("source", null); }} />
            )}
            {params.get("hours") && (
              <Chip label={`${params.get("hours")}h`} onRemove={() => updateParam("hours", null)} />
            )}
            <button
              onClick={() => router.push("/search")}
              className="text-[10px] text-[var(--ink-3)] hover:text-[var(--ink)] underline underline-offset-2 ml-1"
            >
              {lang === "ja" ? "すべてクリア" : "Clear all"}
            </button>
          </div>
        )}
      </div>

      {/* Result count after client-side filter */}
      {readFilter !== "all" && mounted && (
        <p className="text-[11px] text-[var(--ink-3)] mb-3">
          {filtered.length} / {articles.length} {lang === "ja" ? "件" : "results"}
          {" "}({lang === "ja"
            ? readFilter === "unread" ? "未読のみ" : "既読のみ"
            : readFilter === "unread" ? "unread only" : "read only"})
        </p>
      )}

      {children(filtered)}
    </div>
  );
}

function Chip({ label, onRemove }: { label: string; onRemove: () => void }) {
  return (
    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 text-[11px] font-medium rounded-full bg-[var(--ink)] text-ink-contrast">
      {label}
      <button onClick={onRemove} className="opacity-60 hover:opacity-100">
        <X size={9} />
      </button>
    </span>
  );
}
