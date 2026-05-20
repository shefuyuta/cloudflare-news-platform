// components/news/NewsCard.tsx
"use client";

import { useState } from "react";
import Link from "next/link";
import type { NewsArticle } from "@/lib/types";
import { CategoryBadge, SubBadge, ImportanceBadge, TagChip } from "./TagBadge";
import { useLang } from "@/components/LangProvider";
import { useBookmarks } from "@/hooks/useBookmarks";

interface Props {
  article: NewsArticle;
  onTagClick?: (tag: string) => void;
  activeTags?: string[];
}

export function NewsCard({ article, onTagClick, activeTags = [] }: Props) {
  const [open, setOpen] = useState(false);
  const { lang, t } = useLang();
  const { isBookmarked, isRead, toggleBookmark, markRead, mounted } = useBookmarks();

  const dt   = article.publishedAt ? new Date(article.publishedAt) : null;
  const date = dt && !isNaN(dt.getTime())
    ? dt.toLocaleDateString(lang === "ja" ? "ja-JP" : "en-US", {
        month: "short", day: "numeric", hour: "2-digit", minute: "2-digit",
      })
    : "—";

  const hasSummary = !!article.summary?.trim();
  const bookmarked = mounted && isBookmarked(article.id);
  const read       = mounted && isRead(article.id);

  return (
    <article className={[
      "border-b hairline py-4 first:pt-0 last:border-b-0 transition-opacity",
      read ? "opacity-60" : "",
    ].join(" ")}>

      {/* Compact row */}
      <div
        className="flex items-start gap-3 cursor-pointer group"
        onClick={() => {
          setOpen(o => !o);
          if (!read) markRead(article.id);
        }}
      >
        {/* Expand indicator */}
        <span className={[
          "mt-1.5 text-[11px] text-[var(--ink-4)] transition-transform duration-200 select-none flex-shrink-0",
          open ? "rotate-90" : "",
        ].join(" ")}>▶</span>

        {/* Title + badges */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            <CategoryBadge category={article.category} />
            <SubBadge
              category={article.category}
              region={article.region}
              subcategory={article.subcategory}
            />
            <ImportanceBadge score={article.importanceScore} />
            {read && mounted && (
              <span className="text-[10px] text-[var(--ink-4)] font-mono">{t("readArticle")}</span>
            )}
            <span className="text-[11px] text-[var(--ink-3)] ml-auto font-mono tracking-wider flex-shrink-0">
              {date}
            </span>
          </div>

          <h2 className="font-display text-lg md:text-xl font-medium leading-snug text-[var(--ink)] group-hover:text-[var(--ink-2)] transition-colors">
            {article.title}
          </h2>

          <span className="text-[11px] text-[var(--ink-3)] font-mono mt-0.5 inline-block">
            {article.source}
          </span>
        </div>

        {/* Bookmark button */}
        {mounted && (
          <button
            onClick={e => { e.stopPropagation(); toggleBookmark(article.id); }}
            title={bookmarked ? t("bookmarked") : t("bookmark")}
            className={[
              "flex-shrink-0 mt-1 p-1 rounded transition-colors text-sm",
              bookmarked
                ? "text-[var(--ink)]"
                : "text-[var(--ink-4)] hover:text-[var(--ink-2)]",
            ].join(" ")}
            aria-label={bookmarked ? t("bookmarked") : t("bookmark")}
          >
            {bookmarked ? "★" : "☆"}
          </button>
        )}
      </div>

      {/* Expanded detail panel */}
      {open && (
        <div className="ml-7 mt-3 pl-3 border-l-2 border-[var(--line)] animate-fadeIn">
          {hasSummary && (
            <p className="text-sm text-[var(--ink-2)] leading-relaxed mb-3">
              {article.summary}
            </p>
          )}

          {/* Source + URL row */}
          <div className="flex items-center gap-3 flex-wrap text-[12px]">
            <span className="font-mono text-[var(--ink-2)]">{article.source}</span>
            <span className="text-[var(--ink-4)]">·</span>
            <Link
              href={article.url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-[var(--ink-3)] hover:text-[var(--ink)] truncate max-w-[20rem] inline-block"
              title={article.url}
              onClick={e => e.stopPropagation()}
            >
              {prettyUrl(article.url)} ↗
            </Link>

            {/* Mark read button */}
            {mounted && !read && (
              <button
                onClick={e => { e.stopPropagation(); markRead(article.id); }}
                className="text-[var(--ink-4)] hover:text-[var(--ink-2)] transition-colors text-[11px] font-medium"
              >
                ✓ {t("markRead")}
              </button>
            )}

            <Link
              href={article.url}
              target="_blank"
              rel="noopener noreferrer"
              className="ml-auto px-3 py-1 rounded-md text-[11px] font-medium ring-1 ring-inset ring-[var(--line)] text-[var(--ink-2)] hover:bg-[var(--line-soft)] transition-colors"
              onClick={e => e.stopPropagation()}
            >
              {lang === "ja" ? "原文を読む ↗" : "Read original ↗"}
            </Link>
          </div>

          {/* Tags */}
          {article.tags.length > 0 && (
            <div className="flex items-center gap-1.5 flex-wrap mt-3">
              {article.tags.slice(0, 6).map(tag => (
                <TagChip
                  key={tag}
                  tag={tag}
                  onClick={onTagClick ? () => onTagClick(tag) : undefined}
                  active={activeTags.includes(tag)}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </article>
  );
}

function prettyUrl(url: string): string {
  try {
    const u = new URL(url);
    return u.hostname.replace(/^www\./, "") + u.pathname.replace(/\/$/, "");
  } catch { return url; }
}
