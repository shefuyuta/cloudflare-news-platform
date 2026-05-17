// app/page.tsx
import { getRequestContext } from " @opennextjs/cloudflare";
import { listArticles } from "@/lib/db";
import { NewsList } from "@/components/news/NewsList";
import type { Env } from "@/lib/types";

export const dynamic = "force-dynamic";
export const runtime = "edge";

export default async function HomePage({ searchParams }: {
  searchParams: Promise<{ q?: string; tag?: string | string[] }>;
}) {
  const sp   = await searchParams;
  const env  = getRequestContext().env as unknown as Env;
  const tags = Array.isArray(sp.tag) ? sp.tag : sp.tag ? [sp.tag] : [];
  const items = await listArticles(env, { q: sp.q, tags, limit: 60 });

  return (
    <>
      <header className="mb-6">
        <p className="text-[11px] uppercase tracking-[0.18em] text-[var(--ink-3)]">Front Page</p>
        <h1 className="font-display text-3xl md:text-4xl font-semibold tracking-tight mt-1">
          Today's edition
        </h1>
        <p className="text-sm text-[var(--ink-3)] mt-2">
          Latest from across General, Cybersecurity, and AI desks.
        </p>
      </header>
      <NewsList articles={items} activeTags={tags} />
    </>
  );
}
