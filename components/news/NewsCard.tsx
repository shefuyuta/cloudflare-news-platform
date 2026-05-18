// components/news/NewsCard.tsx
"use client";

import { useState } from "react";
import Link from "next/link";
import type { NewsArticle } from "@/lib/types";
import { CategoryBadge, SubBadge, ImportanceBadge, TagChip } from "./TagBadge";
import { useLang } from "@/components/LangProvider";

interface Props {
  article: NewsArticle;
  onTagClick?: (tag: string) => void;
  activeTags?: string[];
}

export function NewsCard({ article, onTagClick, activeTags = [] }: Props) {
  const [open, setOpen] = useState(false);
  const { lang } = useLang();

  const dt = article.publishedAt ? new Date(article.publishedAt) : null;
  const date = dt && !isNaN(dt.getTime())
    ? dt.toLocaleDateString(lang === "ja" ? "ja-JP" : "en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })
    : "—";

  const hasSummary = !!article.summary?.trim();

  return (
    <article className="border-b hairline py-4 first:pt-0 last:border-b-0">
      {/* Compact row: badges + title + date (always visible) -------------- */}
      <div
        className="flex items-start gap-3 cursor-pointer group"
        onClick={() => setOpen(o => !o)}
      >
        {/* Expand indicator */}
        <span className={[
          "mt-1.5 text-[11px] text-[var(--ink-4)] transition-transform duration-200 select-none flex-shrink-0",
          open ? "rotate-90" : "",
        ].join(" ")}>
          ▶
        </span>

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
            <span className="text-[11px] text-[var(--ink-3)] ml-auto font-mono tracking-wider flex-shrink-0">
              {date}
            </span>
          </div>

          <h2 className="font-display text-lg md:text-xl font-medium leading-snug text-[var(--ink)] group-hover:text-[var(--ink-2)] transition-colors">
            {article.title}
          </h2>

          {/* Source name shown even when collapsed */}
          <span className="text-[11px] text-[var(--ink-3)] font-mono mt-0.5 inline-block">
            {article.source}
          </span>
        </div>
      </div>

      {/* Expanded detail panel -------------------------------------------- */}
      {open && (
        <div className="ml-7 mt-3 pl-3 border-l-2 border-[var(--line)] animate-fadeIn">
          {/* Summary (only if available) */}
          {hasSummary && (
            <p className="text-sm text-[var(--ink-2)] leading-relaxed mb-3">
              {article.summary}
            </p>
          )}

          {/* Source + URL + Open button */}
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
              {article.tags.slice(0, 6).map(t => (
                <TagChip
                  key={t}
                  tag={t}
                  onClick={onTagClick ? () => onTagClick(t) : undefined}
                  active={activeTags.includes(t)}
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
