// app/search/page.tsx
import { Suspense } from "react";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { listArticles, listAllTags } from "@/lib/db";
import { semanticSearch } from "@/lib/search/semantic";
import { loadRuntimeConfig } from "@/lib/rag/config";
import { SearchPage as SearchPageClient } from "@/components/search/SearchPage";
import type { Env, NewsArticle, ArticleQuery } from "@/lib/types";
import type { Category } from "@/lib/categories";
import { cookies } from "next/headers";
import { t, type Lang, DEFAULT_LANG, LANG_COOKIE } from "@/lib/i18n";
export const dynamic = "force-dynamic";

interface SP {
  q?: string;
  tag?: string | string[];
  source?: string;
  category?: string;
  region?: string;
  subcategory?: string;
  hours?: string;
  /** "semantic" (default when q present) | "keyword" (LIKE fallback). */
  mode?: string;
}

export default async function SearchPage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp   = await searchParams;
  const env  = (await getCloudflareContext()).env as unknown as Env;
  const cookieStore = await cookies();
  const lang = (cookieStore.get(LANG_COOKIE)?.value as Lang) ?? DEFAULT_LANG;

  const tags      = Array.isArray(sp.tag) ? sp.tag : sp.tag ? [sp.tag] : [];
  const noTimeLim = !sp.hours || sp.hours === "all";
  const hoursAgo  = noTimeLim ? undefined : parseInt(sp.hours!, 10);
  const hasQuery  = !!sp.q && sp.q.trim().length > 0;

  // Semantic is the default whenever there's a free-text query, unless the
  // user explicitly forces keyword mode (?mode=keyword) — kept as a
  // deterministic fallback and for verifying classification of mixed-
  // language sources.
  const useSemantic = hasQuery && sp.mode !== "keyword";

  const query: ArticleQuery = {
    q:           sp.q,
    tags,
    source:      sp.source,
    category:    sp.category as Category | undefined,
    region:      sp.region,
    subcategory: sp.subcategory,
    noTimeLimit: noTimeLim,
    hoursAgo,
    limit:       200,
  };

  const cfg = useSemantic ? await loadRuntimeConfig(env) : null;

  let items: NewsArticle[];
  let mode: "semantic" | "keyword";

  if (useSemantic && cfg) {
    try {
      items = await semanticSearch(env, cfg, {
        query:       sp.q!,
        category:    sp.category,
        region:      sp.region,
        subcategory: sp.subcategory,
        source:      sp.source,
        tags,
        hoursAgo,
        noTimeLimit: noTimeLim,
        limit:       200,
      });
      mode = "semantic";
      // If semantic returns nothing (e.g. articles not yet embedded),
      // fall back to keyword so the page is never empty by accident.
      if (items.length === 0) {
        items = await listArticles(env, query);
        mode  = "keyword";
      }
    } catch {
      // Vectorize/embedding failure → deterministic keyword fallback.
      items = await listArticles(env, query);
      mode  = "keyword";
    }
  } else {
    items = await listArticles(env, query);
    mode  = "keyword";
  }

  const allTags = (await listAllTags(env)).map(t => t.name);

  // Semantic results arrive similarity-ranked, which is the natural order
  // for a meaning-based query, so we keep it by default. Only when the
  // user explicitly picks the date sort chip do we re-sort by recency.
  // Keyword mode already honoured sort via listArticles.
  if (mode === "semantic" && (sp as { sort?: string }).sort === "date") {
    items = [...items].sort((a, b) => b.publishedAt.localeCompare(a.publishedAt));
  }

  const filters: string[] = [];
  if (sp.q)           filters.push(`"${sp.q}"`);
  if (sp.source)      filters.push(sp.source);
  if (sp.category)    filters.push(sp.category);
  if (tags.length)    filters.push(tags.map(tg => `#${tg}`).join(" "));

  const title = filters.length > 0
    ? `${t("searchResultsFor", lang)} ${filters.join(" · ")}`
    : t("navSearch", lang);

  const modeLabel = hasQuery
    ? (mode === "semantic"
        ? (lang === "ja" ? "意味検索" : "Semantic")
        : (lang === "ja" ? "キーワード検索" : "Keyword"))
    : null;

  const subtitle = [
    noTimeLim ? (lang === "ja" ? "全期間" : "All time") : (lang === "ja" ? `過去${hoursAgo}時間` : `Last ${hoursAgo}h`),
    `${items.length.toLocaleString()} ${lang === "ja" ? "件" : "results"}`,
    ...(modeLabel ? [modeLabel] : []),
  ].join(" · ");

  return (
    // SearchPageClient uses useSearchParams → must be in Suspense
    <Suspense fallback={
      <div className="p-8 text-sm text-[var(--ink-3)]">
        {lang === "ja" ? "読み込み中…" : "Loading…"}
      </div>
    }>
      <SearchPageClient
        articles={items}
        activeTags={tags}
        title={title}
        subtitle={subtitle}
        lang={lang}
        allTags={allTags}
        searchMode={mode}
      />
    </Suspense>
  );
}
