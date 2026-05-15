// components/news/NewsCard.tsx
import Link from "next/link";
import type { NewsArticle } from "@/lib/types";
import { CategoryBadge, SubBadge, ImportanceBadge, TagChip } from "./TagBadge";

interface Props {
  article: NewsArticle;
  onTagClick?: (tag: string) => void;
  activeTags?: string[];
}

export function NewsCard({ article, onTagClick, activeTags = [] }: Props) {
  const dt = article.publishedAt ? new Date(article.publishedAt) : null;
  const date = dt && !isNaN(dt.getTime())
    ? dt.toLocaleDateString("en-US", { month: "short", day: "numeric" })
    : "—";

  return (
    <article className="card-hover border-b hairline py-6 first:pt-0 last:border-b-0">
      {/* meta row: category + sub + importance + date ----------------------- */}
      <div className="flex items-center gap-2 mb-3 flex-wrap">
        <CategoryBadge category={article.category} />
        <SubBadge
          category={article.category}
          region={article.region}
          subcategory={article.subcategory}
        />
        <ImportanceBadge score={article.importanceScore} />
        <span className="text-[11px] text-[var(--ink-3)] ml-auto font-mono uppercase tracking-wider">
          {date}
        </span>
      </div>

      {/* title — the headline does the heavy aesthetic lift ---------------- */}
      <h2 className="font-display text-xl md:text-[22px] font-medium leading-snug text-[var(--ink)]">
        <Link
          href={article.url}
          target="_blank"
          rel="noopener noreferrer"
          className="hover:underline decoration-[var(--ink-3)] underline-offset-4"
        >
          {article.title}
        </Link>
      </h2>

      {/* summary ----------------------------------------------------------- */}
      {article.summary && (
        <p className="mt-2 text-sm text-[var(--ink-2)] leading-relaxed line-clamp-2">
          {article.summary}
        </p>
      )}

      {/* footer: source + url + tags --------------------------------------- */}
      <div className="mt-3 flex items-center gap-3 flex-wrap text-[12px]">
        <span className="font-mono text-[var(--ink-2)]">{article.source}</span>
        <span className="text-[var(--ink-4)]">·</span>
        <Link
          href={article.url}
          target="_blank"
          rel="noopener noreferrer"
          className="text-[var(--ink-3)] hover:text-[var(--ink)] truncate max-w-[16rem] inline-block"
          title={article.url}
        >
          {prettyUrl(article.url)} ↗
        </Link>

        {article.tags.length > 0 && (
          <div className="flex items-center gap-1.5 flex-wrap ml-auto">
            {article.tags.slice(0, 4).map(t => (
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
    </article>
  );
}

function prettyUrl(url: string): string {
  try {
    const u = new URL(url);
    return u.hostname.replace(/^www\./, "") + u.pathname.replace(/\/$/, "");
  } catch { return url; }
}
