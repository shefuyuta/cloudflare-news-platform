// components/news/NewsCard.tsx
"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import type { NewsArticle } from "@/lib/types";
import { CategoryBadge, SubBadge, CrossBadge, TagChip, TechBadge } from "./TagBadge";
import { useLang } from "@/components/LangProvider";
import { useBookmarks } from "@/hooks/useBookmarks";
import { Bookmark, BookmarkCheck, ChevronRight, ExternalLink, Check, MessageCircle } from "@/components/ui/Icon";

/**
 * Builds a short "why this matched" excerpt around the first match of any
 * query word in the article's summary. Returns null when nothing matches —
 * expected and fine for semantic-search results, where the match is by
 * meaning rather than literal words, so there's often nothing to point at.
 * Deliberately NOT shown for those cases rather than showing an unrelated
 * sentence, which would be more misleading than no excerpt at all.
 */
const EXCERPT_WINDOW = 40; // chars of context on each side of the match

/**
 * Splits a query into candidate words. Plain whitespace-splitting is
 * enough for English ("AI security" -> ["AI","security"]), but Japanese
 * has no spaces between words, so a query like "AIセキュリティ" would stay
 * one unmatchable blob (never appears verbatim in an English summary).
 * This also splits at script-type boundaries (Latin/digits vs Katakana vs
 * Hiragana vs Kanji), which approximates word boundaries well enough for
 * short queries without a full morphological analyzer — "AIセキュリティ"
 * splits into "AI" and "セキュリティ", either of which can then match.
 */
function extractQueryWords(query: string): string[] {
  const bySpace = query.trim().split(/\s+/);
  const words = new Set<string>();
  for (const chunk of bySpace) {
    // \p{Script} boundary split: group consecutive chars of the same script.
    const parts = chunk.match(/[A-Za-z0-9]+|[\u30A0-\u30FF]+|[\u3040-\u309F]+|[\u4E00-\u9FFF]+|[^\sA-Za-z0-9\u30A0-\u30FF\u3040-\u309F\u4E00-\u9FFF]+/g) ?? [chunk];
    for (const p of parts) words.add(p);
    words.add(chunk); // keep the whole chunk too, in case it matches verbatim
  }
  return [...words].filter(w => w.length >= 2);
}

function buildMatchExcerpt(summary: string | undefined, query: string | undefined): { before: string; match: string; after: string } | null {
  if (!summary || !query?.trim()) return null;
  const words = extractQueryWords(query);
  if (!words.length) return null;

  const lowerSummary = summary.toLowerCase();
  let bestIndex = -1;
  let bestLen = 0;
  for (const w of words) {
    const idx = lowerSummary.indexOf(w.toLowerCase());
    if (idx !== -1 && (bestIndex === -1 || idx < bestIndex)) {
      bestIndex = idx;
      bestLen = w.length;
    }
  }
  if (bestIndex === -1) return null;

  const start = Math.max(0, bestIndex - EXCERPT_WINDOW);
  const end   = Math.min(summary.length, bestIndex + bestLen + EXCERPT_WINDOW);
  return {
    before: (start > 0 ? "…" : "") + summary.slice(start, bestIndex),
    match:  summary.slice(bestIndex, bestIndex + bestLen),
    after:  summary.slice(bestIndex + bestLen, end) + (end < summary.length ? "…" : ""),
  };
}

interface Props {
  article:     NewsArticle;
  onTagClick?: (tag: string) => void;
  activeTags?: string[];
  isOpen?:     boolean;
  onToggle?:   (id: string) => void;
  // Passed from NewsList so all cards share the same read state
  isReadProp?: boolean;
  onAskChat?: (msg: string) => void;
  /** Search page only: shows a short highlighted excerpt around a match of
   *  this query in the collapsed card, as a preview of why it matched. */
  searchQuery?: string;
}

export function NewsCard({
  article, onTagClick, activeTags = [], isOpen, onToggle, isReadProp, onAskChat, searchQuery,
}: Props) {
  const { lang, t } = useLang();
  // useBookmarks only for bookmark state — isRead comes from parent (NewsList)
  const { isBookmarked, toggleBookmark, mounted } = useBookmarks();

  const matchExcerpt = buildMatchExcerpt(article.summary, searchQuery);

  const dt   = article.publishedAt ? new Date(article.publishedAt) : null;
  const date = dt && !isNaN(dt.getTime())
    ? dt.toLocaleDateString(lang === "ja" ? "ja-JP" : "en-US", {
        month: "short", day: "numeric", hour: "2-digit", minute: "2-digit",
      })
    : "—";

  const bookmarked = mounted && isBookmarked(article.id);

  // Related (same-story) articles: the count comes with the list query,
  // but the actual titles/URLs are fetched lazily only when the card is
  // opened and has a related count, so collapsed lists stay cheap.
  type RelatedItem = { id: string; title: string; source: string; url: string; publishedAt: string };
  const [related, setRelated] = useState<RelatedItem[] | null>(null);
  const [relatedLoading, setRelatedLoading] = useState(false);
  useEffect(() => {
    if (!isOpen || !article.relatedCount || related !== null || relatedLoading) return;
    setRelatedLoading(true);
    fetch(`/api/related?id=${encodeURIComponent(article.id)}`)
      .then(r => r.json() as Promise<{ related?: RelatedItem[] }>)
      .then(data => setRelated(data.related ?? []))
      .catch(() => setRelated([]))
      .finally(() => setRelatedLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, article.id, article.relatedCount]);
  // Use prop if provided (from NewsList), fallback to false
  const read = isReadProp ?? false;

  // Split control tags (multi-label routing) from user-facing tags.
  // Cross-desk labels ("AI"/"Cyber") become badges; sub:* and tech:* are
  // hidden from the plain tag list — tech:* gets its own readable badge
  // (TechBadge) instead of showing up as raw "#tech:phishing-genai" text.
  const crossLabels = article.tags.filter(t => t === "AI" || t === "Cyber");
  const techniqueTags = article.tags.filter(t => t.startsWith("tech:"));
  const displayTags = article.tags.filter(t => !t.startsWith("sub:") && !t.startsWith("tech:") && t !== "AI" && t !== "Cyber");

  function handleHeaderClick() {
    if (onToggle) onToggle(article.id);
  }

  return (
    <article className={[
      "border-b hairline py-4 first:pt-0 last:border-b-0 transition-all duration-300 group",
      read ? "opacity-60 saturate-50 bg-[var(--line-soft)] hover:bg-[var(--line)]" : "hover:bg-[var(--line-soft)]",
    ].join(" ")}>

      <div className="flex items-start gap-3 cursor-pointer" onClick={handleHeaderClick}>
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
            {techniqueTags.map(t => (
              <TechBadge key={t} tag={t} lang={lang} />
            ))}
            {read && (
              <span className="text-[10px] text-[var(--ink-4)] font-mono flex items-center gap-0.5">
                <Check size={10} strokeWidth={2} />{t("readArticle")}
              </span>
            )}
            <span className="text-[11px] text-[var(--ink-3)] ml-auto font-mono tracking-wider flex-shrink-0">{date}</span>
          </div>
          <h2 className={[
            "font-display text-lg md:text-xl font-medium leading-snug transition-colors",
            read ? "text-[var(--ink-3)]" : "text-[var(--ink)]",
          ].join(" ")}>
            {article.title}
          </h2>
          {!isOpen && matchExcerpt && (
            <p className="text-[13px] text-[var(--ink-3)] leading-snug mt-1 mb-0.5">
              {matchExcerpt.before}
              <mark className="bg-amber-200/60 text-[var(--ink)] rounded-sm px-0.5">{matchExcerpt.match}</mark>
              {matchExcerpt.after}
            </p>
          )}
          <span className="text-[11px] text-[var(--ink-3)] font-mono mt-0.5 inline-flex items-center gap-1.5">
            {article.source}
            {article.relevanceScore !== undefined && (
              <span
                className="text-[10px] px-1.5 py-0.5 rounded-full bg-[var(--line-soft)] text-[var(--ink-3)] font-sans"
                title={lang === "ja" ? "意味的な関連度スコア" : "Semantic relevance score"}
              >
                {Math.round(article.relevanceScore * 100)}% {lang === "ja" ? "一致" : "match"}
              </span>
            )}
            {!!article.relatedCount && (
              <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-[var(--line-soft)] text-[var(--ink-3)] font-sans">
                +{article.relatedCount} {lang === "ja" ? "件" : "more"}
              </span>
            )}
          </span>
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

          {!!article.relatedCount && (
            <div className="mb-3">
              <p className="text-[11px] uppercase tracking-widest text-[var(--ink-3)] mb-1.5">
                {lang === "ja" ? `関連記事 ${article.relatedCount}件` : `Related coverage (${article.relatedCount})`}
              </p>
              {relatedLoading ? (
                <p className="text-[12px] text-[var(--ink-4)]">{lang === "ja" ? "読み込み中…" : "Loading…"}</p>
              ) : (
                <ul className="space-y-1">
                  {(related ?? []).map(r => (
                    <li key={r.id}>
                      <Link
                        href={r.url} target="_blank" rel="noopener noreferrer"
                        className="text-[12px] text-[var(--ink-2)] hover:text-[var(--ink)] hover:underline flex items-baseline gap-1.5"
                        onClick={e => e.stopPropagation()}
                      >
                        <span className="font-mono text-[10px] text-[var(--ink-4)] flex-shrink-0">{r.source}</span>
                        <span className="truncate">{r.title}</span>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </div>
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
