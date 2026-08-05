// components/news/NewsCard.tsx
"use client";

import { useState } from "react";
import Link from "next/link";
import type { NewsArticle } from "@/lib/types";
import { CategoryBadge, SubBadge, CrossBadge, TagChip } from "./TagBadge";
import { useLang } from "@/components/LangProvider";
import { useBookmarks } from "@/hooks/useBookmarks";
import { Bookmark, BookmarkCheck, ChevronRight, ExternalLink, Check, MessageCircle } from "@/components/ui/Icon";

interface Props {
  article:     NewsArticle;
  onTagClick?: (tag: string) => void;
  activeTags?: string[];
  isOpen?:     boolean;
  onToggle?:   (id: string) => void;
  // Passed from NewsList so all cards share the same read state
  isReadProp?: boolean;
  onAskChat?: (msg: string) => void;
}

export function NewsCard({
  article, onTagClick, activeTags = [], isOpen, onToggle, isReadProp, onAskChat,
}: Props) {
  const { lang, t } = useLang();
  // useBookmarks only for bookmark state — isRead comes from parent (NewsList)
  const { isBookmarked, toggleBookmark, mounted } = useBookmarks();

  const dt   = article.publishedAt ? new Date(article.publishedAt) : null;
  const date = dt && !isNaN(dt.getTime())
    ? dt.toLocaleDateString(lang === "ja" ? "ja-JP" : "en-US", {
        month: "short", day: "numeric", hour: "2-digit", minute: "2-digit",
      })
    : "—";

  const bookmarked = mounted && isBookmarked(article.id);
  // Use prop if provided (from NewsList), fallback to false
  const read = isReadProp ?? false;

  // Split control tags (multi-label routing) from user-facing tags.
  // Cross-desk labels ("AI"/"Cyber") become badges; sub:* are hidden.
  const crossLabels = article.tags.filter(t => t === "AI" || t === "Cyber");
  const displayTags = article.tags.filter(t => !t.startsWith("sub:") && t !== "AI" && t !== "Cyber");

  function handleHeaderClick() {
    if (onToggle) onToggle(article.id);
  }

  return (
    <article className={[
      "border-b hairline py-4 first:pt-0 last:border-b-0 transition-opacity duration-300",
      read ? "opacity-60" : "",
    ].join(" ")}>

      <div className="flex items-start gap-3 cursor-pointer group" onClick={handleHeaderClick}>
        <span className={[
          "mt-1.5 text-[var(--ink-4)] transition-transform duration-200 flex-shrink-0",
          isOpen ? "rotate-90" : "",
        ].join(" ")}>
          <ChevronRight size={14} strokeWidth={1.5} />
        </span>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            <CategoryBadge category={article.category} />
            <SubBadge category={article.category} region={article.region} subcategory={article.subcategory} />
            {crossLabels.slice(0, 2).map(l => (
              <CrossBadge key={l} label={l} primary={article.category} />
            ))}
            {read && (
              <span className="text-[10px] text-[var(--ink-4)] font-mono flex items-center gap-0.5">
                <Check size={10} strokeWidth={2} />{t("readArticle")}
              </span>
            )}
            <span className="text-[11px] text-[var(--ink-3)] ml-auto font-mono tracking-wider flex-shrink-0">{date}</span>
          </div>
          <h2 className="font-display text-lg md:text-xl font-medium leading-snug text-[var(--ink)] group-hover:text-[var(--ink-2)] transition-colors">
            {article.title}
          </h2>
          <span className="text-[11px] text-[var(--ink-3)] font-mono mt-0.5 inline-block">{article.source}</span>
        </div>

        {mounted && (
          <button
            onClick={e => { e.stopPropagation(); toggleBookmark(article.id); }}
            title={bookmarked ? t("bookmarked") : t("bookmark")}
            className={[
              "flex-shrink-0 mt-1 p-1 rounded transition-colors",
              bookmarked ? "text-[var(--ink)]" : "text-[var(--ink-4)] hover:text-[var(--ink-2)]",
            ].join(" ")}
          >
            {bookmarked
              ? <BookmarkCheck size={15} strokeWidth={1.5} />
              : <Bookmark size={15} strokeWidth={1.5} />}
          </button>
        )}
      </div>

      {isOpen && (
        <div className="ml-7 mt-3 pl-3 border-l-2 border-[var(--line)] animate-fadeIn">
          {article.content?.trim() ? (
            <ContentExcerpt content={article.content} lang={lang} />
          ) : article.summary?.trim() ? (
            <p className="text-sm text-[var(--ink-2)] leading-relaxed mb-3">{article.summary}</p>
          ) : (
            <p className="text-sm text-[var(--ink-4)] italic mb-3">
              {lang === "ja" ? "本文取得中…次回更新時に表示されます。" : "Content will appear after the next refresh."}
            </p>
          )}

          <div className="flex items-center gap-3 flex-wrap text-[12px]">
            <span className="font-mono text-[var(--ink-2)]">{article.source}</span>
            <span className="text-[var(--ink-4)]">·</span>
            <Link
              href={article.url} target="_blank" rel="noopener noreferrer"
              className="font-mono text-[var(--ink-3)] hover:text-[var(--ink)] truncate max-w-[20rem] inline-block"
              onClick={e => e.stopPropagation()}
            >
              {prettyUrl(article.url)}
            </Link>
            <Link
              href={article.url} target="_blank" rel="noopener noreferrer"
              className="ml-auto px-3 py-1 rounded-md text-[11px] font-medium ring-1 ring-inset ring-[var(--line)] text-[var(--ink-2)] hover:bg-[var(--line-soft)] transition-colors flex items-center gap-1.5"
              onClick={e => e.stopPropagation()}
            >
              {lang === "ja" ? "原文を読む" : "Read original"}
              <ExternalLink size={11} strokeWidth={1.5} />
            </Link>
            {onAskChat && (
              <button
                onClick={e => {
                  e.stopPropagation();
                  onAskChat(`「${article.title}」について教えてください。ソース: ${article.source}`);
                }}
                className="px-3 py-1 rounded-md text-[11px] font-medium ring-1 ring-inset ring-[var(--line)] text-[var(--ink-2)] hover:bg-[var(--line-soft)] transition-colors flex items-center gap-1.5"
              >
                <MessageCircle size={11} strokeWidth={1.5} />
                {lang === "ja" ? "AIに聞く" : "Ask AI"}
              </button>
            )}
          </div>

          {displayTags.length > 0 && (
            <div className="flex items-center gap-1.5 flex-wrap mt-3">
              {displayTags.slice(0, 6).map(tag => (
                <TagChip
                  key={tag} tag={tag}
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

function ContentExcerpt({ content, lang }: { content: string; lang: string }) {
  const [expanded, setExpanded] = useState(false);
  const PREVIEW = 400;
  const isLong  = content.length > PREVIEW;
  const shown   = expanded || !isLong ? content : content.slice(0, PREVIEW) + "…";
  return (
    <div className="mb-3">
      <p className="text-sm text-[var(--ink-2)] leading-relaxed whitespace-pre-line">{shown}</p>
      {isLong && (
        <button
          onClick={e => { e.stopPropagation(); setExpanded(v => !v); }}
          className="mt-1.5 text-[11px] text-[var(--ink-3)] hover:text-[var(--ink)] underline underline-offset-2"
        >
          {expanded
            ? (lang === "ja" ? "折りたたむ" : "Show less")
            : (lang === "ja" ? `全文を表示（${content.length}文字）` : `Show full excerpt (${content.length} chars)`)}
        </button>
      )}
    </div>
  );
}
