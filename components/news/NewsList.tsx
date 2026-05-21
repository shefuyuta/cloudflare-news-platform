// components/news/NewsList.tsx
"use client";

import { useState, useCallback } from "react";
import type { NewsArticle } from "@/lib/types";
import { NewsCard } from "./NewsCard";
import { ExportButton } from "./ExportButton";
import { useLang } from "@/components/LangProvider";
import { useKeywordAlerts } from "@/hooks/useKeywordAlerts";
import { useBookmarks } from "@/hooks/useBookmarks";
import { Bell, X, ChevronLeft, ChevronRight } from "@/components/ui/Icon";

const PAGE_SIZE_OPTIONS = [20, 50, 100] as const;
type PageSize = typeof PAGE_SIZE_OPTIONS[number];

export function NewsList({ articles, activeTags = [] }: {
  articles: NewsArticle[];
  activeTags?: string[];
}) {
  const { t, lang } = useLang();
  const { markRead } = useBookmarks();
  const { keywords, matches, newCount, dismissAlerts, mounted } = useKeywordAlerts(articles);
  const [alertDismissed, setAlertDismissed] = useState(false);

  // Pagination state
  const [page, setPage]           = useState(1);
  const [pageSize, setPageSize]   = useState<PageSize>(20);

  // Accordion: track which article is open (null = none)
  const [openId, setOpenId] = useState<string | null>(null);

  const showAlert = mounted && newCount > 0 && !alertDismissed;

  // When toggling: close previous (mark it read), open new
  const handleToggle = useCallback((id: string) => {
    setOpenId(prev => {
      if (prev === id) {
        // Closing current → mark read
        markRead(id);
        return null;
      }
      // Closing previous → mark it read
      if (prev !== null) markRead(prev);
      return id;
    });
  }, [markRead]);

  // Reset to page 1 when pageSize changes
  function handlePageSizeChange(size: PageSize) {
    setPageSize(size);
    setPage(1);
    setOpenId(null);
  }

  const totalPages = Math.max(1, Math.ceil(articles.length / pageSize));
  const paginated  = articles.slice((page - 1) * pageSize, page * pageSize);

  function handleDismiss() { dismissAlerts(); setAlertDismissed(true); }

  function goPage(n: number) {
    setPage(Math.max(1, Math.min(totalPages, n)));
    setOpenId(null);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  return (
    <div>
      {/* ── Toolbar ──────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between mb-4 gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <span className="text-[11px] text-[var(--ink-3)]">
            {articles.length.toLocaleString()} {lang === "ja" ? "件" : "articles"}
          </span>
          {/* Page size selector */}
          <div className="flex items-center gap-1">
            {PAGE_SIZE_OPTIONS.map(n => (
              <button
                key={n}
                onClick={() => handlePageSizeChange(n)}
                className={[
                  "px-2 py-0.5 text-[11px] font-medium rounded transition-colors",
                  pageSize === n
                    ? "bg-[var(--ink)] text-white"
                    : "text-[var(--ink-3)] hover:text-[var(--ink)] hover:bg-[var(--line-soft)]",
                ].join(" ")}
              >
                {n}
              </button>
            ))}
          </div>
        </div>
        <ExportButton />
      </div>

      {/* ── Keyword alert banner ─────────────────────────────────────── */}
      {showAlert && keywords.length > 0 && (
        <div className="mb-4 p-3 bg-amber-50 border border-amber-200 rounded-lg flex items-start justify-between gap-3">
          <div>
            <p className="text-sm font-medium text-amber-800 flex items-center gap-1.5">
              <Bell size={13} strokeWidth={1.5} />
              {newCount} {t("alertMatches")} — {keywords.join(", ")}
            </p>
            <ul className="mt-1.5 space-y-0.5">
              {matches.slice(0, 3).map(a => (
                <li key={a.id} className="text-[12px] text-amber-700 truncate">· {a.title}</li>
              ))}
              {matches.length > 3 && (
                <li className="text-[12px] text-amber-600">+{matches.length - 3} {lang === "ja" ? "件" : "more"}</li>
              )}
            </ul>
          </div>
          <button onClick={handleDismiss} className="text-amber-600 hover:text-amber-800 flex-shrink-0">
            <X size={14} strokeWidth={1.5} />
          </button>
        </div>
      )}

      {/* ── Article list ─────────────────────────────────────────────── */}
      {!articles.length ? (
        <div className="py-20 text-center">
          <p className="font-display text-lg text-[var(--ink-3)]">{t("noArticles")}</p>
          <p className="text-sm text-[var(--ink-4)] mt-2">{t("noArticlesSub")}</p>
        </div>
      ) : (
        <>
          <div className="divide-y divide-[var(--line)]">
            {paginated.map(a => (
              <NewsCard
                key={a.id}
                article={a}
                activeTags={activeTags}
                isOpen={openId === a.id}
                onToggle={handleToggle}
              />
            ))}
          </div>

          {/* ── Pagination ───────────────────────────────────────────── */}
          {totalPages > 1 && (
            <div className="mt-8 flex items-center justify-center gap-2">
              <button
                onClick={() => goPage(page - 1)}
                disabled={page === 1}
                className="p-1.5 rounded-md text-[var(--ink-3)] hover:text-[var(--ink)] hover:bg-[var(--line-soft)] disabled:opacity-30 transition-colors"
              >
                <ChevronLeft size={16} strokeWidth={1.5} />
              </button>

              {/* Page number buttons */}
              {Array.from({ length: totalPages }, (_, i) => i + 1)
                .filter(n => n === 1 || n === totalPages || Math.abs(n - page) <= 2)
                .reduce<(number | "…")[]>((acc, n, i, arr) => {
                  if (i > 0 && n - (arr[i - 1] as number) > 1) acc.push("…");
                  acc.push(n);
                  return acc;
                }, [])
                .map((n, i) =>
                  n === "…" ? (
                    <span key={`ellipsis-${i}`} className="text-[var(--ink-4)] text-sm px-1">…</span>
                  ) : (
                    <button
                      key={n}
                      onClick={() => goPage(n as number)}
                      className={[
                        "min-w-[32px] h-8 px-2 text-sm rounded-md transition-colors",
                        page === n
                          ? "bg-[var(--ink)] text-white font-medium"
                          : "text-[var(--ink-2)] hover:bg-[var(--line-soft)]",
                      ].join(" ")}
                    >
                      {n}
                    </button>
                  )
                )}

              <button
                onClick={() => goPage(page + 1)}
                disabled={page === totalPages}
                className="p-1.5 rounded-md text-[var(--ink-3)] hover:text-[var(--ink)] hover:bg-[var(--line-soft)] disabled:opacity-30 transition-colors"
              >
                <ChevronRight size={16} strokeWidth={1.5} />
              </button>

              <span className="text-[11px] text-[var(--ink-3)] ml-2">
                {page} / {totalPages} {lang === "ja" ? "ページ" : "pages"}
              </span>
            </div>
          )}
        </>
      )}
    </div>
  );
}
