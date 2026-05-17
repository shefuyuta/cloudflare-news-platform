// app/important/page.tsx
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { listArticles } from "@/lib/db";
import { NewsList } from "@/components/news/NewsList";
import { IMPORTANT_THRESHOLD } from "@/lib/categories";
import type { Env } from "@/lib/types";



export default async function ImportantPage({ searchParams }: {
  searchParams: Promise<{ q?: string; tag?: string | string[] }>;
}) {
  const sp   = await searchParams;
  const env  = (await getCloudflareContext()).env as unknown as Env;
  const tags = Array.isArray(sp.tag) ? sp.tag : sp.tag ? [sp.tag] : [];

  const items = await listArticles(env, { important: true, q: sp.q, tags, limit: 80 });

  return (
    <>
      <header className="mb-6">
        <p className="text-[11px] uppercase tracking-[0.18em] text-[var(--ink-3)]">Cross-cut</p>
        <h1 className="font-display text-3xl md:text-4xl font-semibold tracking-tight mt-1">
          Important <span className="text-[var(--ink-3)] font-normal">重要記事</span>
        </h1>
        <p className="text-sm text-[var(--ink-3)] mt-2">
          High-importance stories across every desk (score ≥ {IMPORTANT_THRESHOLD}).
        </p>
      </header>
      <NewsList articles={items} activeTags={tags} />
    </>
  );
}
