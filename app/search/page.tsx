// app/search/page.tsx
import { Suspense } from "react";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { listArticles } from "@/lib/db";
import { SearchPage as SearchPageClient } from "@/components/search/SearchPage";
import { listAllTags } from "@/lib/db";
import type { Env } from "@/lib/types";
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
}

export default async function SearchPage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp   = await searchParams;
  const env  = (await getCloudflareContext()).env as unknown as Env;
  const cookieStore = await cookies();
  const lang = (cookieStore.get(LANG_COOKIE)?.value as Lang) ?? DEFAULT_LANG;

  const tags      = Array.isArray(sp.tag) ? sp.tag : sp.tag ? [sp.tag] : [];
  const noTimeLim = !sp.hours || sp.hours === "all";
  const hoursAgo  = noTimeLim ? undefined : parseInt(sp.hours!, 10);

  const [items, allTags] = await Promise.all([
    listArticles(env, {
    q:           sp.q,
    tags,
    source:      sp.source,
    category:    sp.category as Category | undefined,
    region:      sp.region,
    subcategory: sp.subcategory,
    noTimeLimit: noTimeLim,
    hoursAgo,
    limit:       200,
  }),
  listAllTags(env),
]);

  const filters: string[] = [];
  if (sp.q)           filters.push(`"${sp.q}"`);
  if (sp.source)      filters.push(sp.source);
  if (sp.category)    filters.push(sp.category);
  if (tags.length)    filters.push(tags.map(tg => `#${tg}`).join(" "));

  const title = filters.length > 0
    ? `${t("searchResultsFor", lang)} ${filters.join(" · ")}`
    : t("navSearch", lang);

  const subtitle = [
    noTimeLim ? (lang === "ja" ? "全期間" : "All time") : (lang === "ja" ? `過去${hoursAgo}時間` : `Last ${hoursAgo}h`),
    `${items.length.toLocaleString()} ${lang === "ja" ? "件" : "results"}`,
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
      />
    </Suspense>
  );
}
