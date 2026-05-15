// app/general/page.tsx
import { getRequestContext } from "@cloudflare/next-on-pages";
import { listArticles, listAllTags } from "@/lib/db";
import { NewsList } from "@/components/news/NewsList";
import { FilterTabs } from "@/components/news/FilterTabs";
import { regionLabel } from "@/lib/categories";
import type { Env } from "@/lib/types";

export const runtime = "edge";

export default async function GeneralPage({ searchParams }: {
  searchParams: Promise<{ region?: string; q?: string; tag?: string | string[] }>;
}) {
  const sp   = await searchParams;
  const env  = getRequestContext().env as unknown as Env;
  const tags = Array.isArray(sp.tag) ? sp.tag : sp.tag ? [sp.tag] : [];

  const [items, available] = await Promise.all([
    listArticles(env, { category: "general", region: sp.region, q: sp.q, tags, limit: 60 }),
    listAllTags(env, "general"),
  ]);

  return (
    <>
      <header className="mb-6">
        <p className="text-[11px] uppercase tracking-[0.18em] text-[var(--ink-3)]">Desk</p>
        <h1 className="font-display text-3xl md:text-4xl font-semibold tracking-tight mt-1">
          General <span className="text-[var(--ink-3)] font-normal">一般ニュース</span>
        </h1>
        <p className="text-sm text-[var(--ink-3)] mt-2">
          Major events, geopolitics, politics, economy, business.
          {sp.region && <span className="ml-1">— {regionLabel(sp.region)}</span>}
        </p>
      </header>
      <FilterTabs category="general" availableTags={available} />
      <NewsList articles={items} activeTags={tags} />
    </>
  );
}
