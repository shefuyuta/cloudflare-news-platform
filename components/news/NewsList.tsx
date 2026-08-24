// components/news/NewsList.tsx
"use client";

import { useState, useCallback } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import type { NewsArticle } from "@/lib/types";
import { NewsCard } from "./NewsCard";
import { ExportButton } from "./ExportButton";
import { useLang } from "@/components/LangProvider";
import { useKeywordAlerts } from "@/hooks/useKeywordAlerts";
import { useBookmarks } from "@/hooks/useBookmarks";
import { Bell, X, ChevronLeft, ChevronRight } from "@/components/ui/Icon";

const PAGE_SIZE_OPTIONS = [20, 50, 100] as const;
type PageSize = typeof PAGE_SIZE_OPTIONS[number];

export function NewsList({ articles, totalCount, page, pageSize, activeTags = [], searchQuery, disablePagination }: {
  /** Only the CURRENT PAGE's rows — the server already applied
   *  LIMIT/OFFSET (see countArticles/listArticles in lib/db.ts). This is
   *  NOT the full result set; do not slice it further client-side. */
  articles: NewsArticle[];
  /** Total rows matching the current filters, across ALL pages — powers
   *  the page-count display and the last-page calculation. */
  totalCount: number;
  /** Current page (1-indexed) and page size, both read from the URL by
   *  the caller (e.g. app/general/page.tsx) and passed straight through —
   *  NewsList doesn't own this state anymore; changing it navigates. */
  page: number;
  pageSize: PageSize;
  activeTags?: string[];
  /** When set (search page only), NewsCard shows a short highlighted
   *  excerpt around any match of this query in the article's summary —
   *  a preview of "why this article matched" before expanding it. */
  searchQuery?: string;
  /** Search page opts out of server-side pagination for now (it applies
   *  its own client-side read/unread filter on top of the fetched set,
   *  which doesn't compose cleanly with a fixed page size yet) — hides
   *  the pager and the page-size selector, showing exactly what was
   *  passed in as `articles`. */
  disablePagination?: boolean;
}) {
  const { t, lang } = useLang();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { markRead, markReadRef, isRead } = useBookmarks();
  const { keywords, matches, newCount, dismissAlerts, mounted } = useKeywordAlerts(articles);
  const [alertDismissed, setAlertDismissed] = useState(false);

  // Accordion: one open at a time. Closing → mark read.
  const [openId, setOpenId] = useState<string | null>(null);

  const showAlert = mounted && newCount > 0 && !alertDismissed;

  // When toggling: close previous (mark it read), open new
  const handleToggle = useCallback((id: string) => {
    setOpenId(prev => {
      if (prev === id) {
        markReadRef.current(id);
        return null;
      }
      if (prev !== null) markReadRef.current(prev);
      return id;
    });
  }, []);

  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));

  function handleDismiss() { dismissAlerts(); setAlertDismissed(true); }

  /** Navigates to a new page/pageSize by rewriting the URL — this re-runs
   *  the server component with new limit/offset, rather than re-slicing
   *  an already-truncated client-side array (the bug this replaces: the
   *  old version capped every desk at whatever `limit` the caller passed,
   *  silently dropping everything past it no matter which page you were
   *  "on"). */
  function navigate(nextPage: number, nextPageSize: PageSize) {
    const sp = new URLSearchParams(searchParams.toString());
    sp.set("page", String(nextPage));
    sp.set("pageSize", String(nextPageSize));
    setOpenId(null);
    router.push(`${pathname}?${sp.toString()}`);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function handlePageSizeChange(size: PageSize) {
    navigate(1, size);
  }

  function goPage(n: number) {
    navigate(Math.max(1, Math.min(totalPages, n)), pageSize);
  }

  return (
    <div>
      {/* ── Toolbar ──────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between mb-4 gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <span className="text-[11px] text-[var(--ink-3)]">
            {totalCount.toLocaleString()} {lang === "ja" ? "件" : "articles"}
          </span>
          {/* Page size selector */}
          {!disablePagination && (
          <div className="flex items-center gap-1">
            {PAGE_SIZE_OPTIONS.map(n => (
              <button
                key={n}
                onClick={() => handlePageSizeChange(n)}
                className={[
                  "px-2 py-0.5 text-[11px] font-medium rounded transition-colors min-h-[36px] sm:min-h-0",
                  pageSize === n
                    ? "bg-[var(--ink)] text-ink-contrast"
                    : "text-[var(--ink-3)] hover:text-[var(--ink)] hover:bg-[var(--line-soft)]",
                ].join(" ")}
              >
                {n}
              </button>
            ))}
          </div>
          )}
        </div>
        <ExportButton articleIds={articles.map(a => a.id)} />
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
          {/* key reflects page + current result set so the list remounts and
             replays the staggered entrance on page change or new filter. */}
          <div
            key={`${page}|${articles.length}|${articles[0]?.id ?? ""}`}
            className="divide-y divide-[var(--line)] stagger"
          >
            {articles.map(a => (
              <NewsCard
                key={a.id}
                article={a}
                activeTags={activeTags}
                searchQuery={searchQuery}
                isOpen={openId === a.id}
                onToggle={handleToggle}
                isReadProp={isRead(a.id)}
                onAskChat={msg => window.dispatchEvent(new CustomEvent("ask-article", { detail: msg }))}
              />
            ))}
          </div>

          {/* ── Pagination ───────────────────────────────────────────── */}
          {!disablePagination && totalPages > 1 && (
            <div className="mt-8 flex items-center justify-center gap-2">
              <button
                onClick={() => goPage(page - 1)}
                disabled={page === 1}
                className="p-1.5 rounded-md text-[var(--ink-3)] hover:text-[var(--ink)] hover:bg-[var(--line-soft)] disabled:opacity-30 transition-colors min-h-[36px] sm:min-h-0"
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
                        "min-w-[32px] h-8 px-2 text-sm rounded-md transition-colors min-h-[36px] sm:min-h-0",
                        page === n
                          ? "bg-[var(--ink)] text-ink-contrast font-medium"
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
                className="p-1.5 rounded-md text-[var(--ink-3)] hover:text-[var(--ink)] hover:bg-[var(--line-soft)] disabled:opacity-30 transition-colors min-h-[36px] sm:min-h-0"
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
