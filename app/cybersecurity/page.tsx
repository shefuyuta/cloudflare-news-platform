// app/cybersecurity/page.tsx
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { listArticles, listAllTags } from "@/lib/db";
import { NewsList } from "@/components/news/NewsList";
import { FilterTabs } from "@/components/news/FilterTabs";
import { subcategoryLabel } from "@/lib/categories";
import type { Env } from "@/lib/types";



export default async function CyberPage({ searchParams }: {
  searchParams: Promise<{ subcategory?: string; q?: string; tag?: string | string[] }>;
}) {
  const sp   = await searchParams;
  const env  = (await getCloudflareContext()).env as unknown as Env;
  const tags = Array.isArray(sp.tag) ? sp.tag : sp.tag ? [sp.tag] : [];

  const [items, available] = await Promise.all([
    listArticles(env, { category: "cybersecurity", subcategory: sp.subcategory, q: sp.q, tags, limit: 60 }),
    listAllTags(env, "cybersecurity"),
  ]);

  return (
    <>
      <header className="mb-6">
        <p className="text-[11px] uppercase tracking-[0.18em] text-[var(--ink-3)]">Desk</p>
        <h1 className="font-display text-3xl md:text-4xl font-semibold tracking-tight mt-1">
          Cybersecurity <span className="text-[var(--ink-3)] font-normal">サイバーセキュリティ</span>
        </h1>
        <p className="text-sm text-[var(--ink-3)] mt-2">
          Vulnerabilities, incidents, and the rest.
          {sp.subcategory && <span className="ml-1">— {subcategoryLabel(sp.subcategory)}</span>}
        </p>
      </header>
      <FilterTabs category="cybersecurity" availableTags={available} />
      <NewsList articles={items} activeTags={tags} />
    </>
  );
}
