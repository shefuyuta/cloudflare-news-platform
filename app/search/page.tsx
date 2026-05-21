// app/search/page.tsx
import { Suspense } from "react";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { listArticles } from "@/lib/db";
import { NewsList } from "@/components/news/NewsList";
import { SearchFilters } from "@/components/search/SearchFilters";
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
  important?: string;
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

  const items = await listArticles(env, {
    q:           sp.q,
    tags,
    source:      sp.source,
    category:    sp.category as Category | undefined,
    region:      sp.region,
    subcategory: sp.subcategory,
    important:   sp.important === "1",
    noTimeLimit: noTimeLim,
    hoursAgo,
    limit:       200,
  });

  const filters: string[] = [];
  if (sp.q)        filters.push(`"${sp.q}"`);
  if (sp.source)   filters.push(sp.source);
  if (sp.category) filters.push(sp.category);
  if (tags.length) filters.push(tags.map(tg => `#${tg}`).join(" "));

  return (
    <>
      <header className="mb-6">
        <h1 className="font-display text-3xl md:text-4xl font-semibold tracking-tight">
          {filters.length > 0
            ? <>{t("searchResultsFor", lang)} <span className="text-[var(--ink-2)]">{filters.join(" · ")}</span></>
            : t("navSearch", lang)}
        </h1>
        <p className="text-sm text-[var(--ink-3)] mt-2">
          {noTimeLim
            ? (lang === "ja" ? "全期間の記事が対象" : "All time")
            : (lang === "ja" ? `過去${hoursAgo}時間が対象` : `Last ${hoursAgo}h`)}
          {" · "}{items.length.toLocaleString()} {lang === "ja" ? "件" : "results"}
        </p>
      </header>

      {/* SearchFilters uses useSearchParams → must be inside Suspense */}
      <Suspense fallback={<NewsList articles={items} activeTags={tags} />}>
        <SearchFilters articles={items}>
          {(filtered) => <NewsList articles={filtered} activeTags={tags} />}
        </SearchFilters>
      </Suspense>
    </>
  );
}
