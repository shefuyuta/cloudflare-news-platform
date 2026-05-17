// app/ai/page.tsx
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { listArticles, listAllTags } from "@/lib/db";
import { NewsList } from "@/components/news/NewsList";
import { FilterTabs } from "@/components/news/FilterTabs";
import type { Env } from "@/lib/types";
import { cookies } from "next/headers";
import { t, type Lang, DEFAULT_LANG, LANG_COOKIE } from "@/lib/i18n";
export const dynamic = "force-dynamic";

export default async function AiPage({ searchParams }: {
  searchParams: Promise<{ q?: string; tag?: string | string[]; hours?: string }>;
}) {
  const sp   = await searchParams;
  const env  = (await getCloudflareContext()).env as unknown as Env;
  const cookieStore = await cookies();
  const lang = (cookieStore.get(LANG_COOKIE)?.value as Lang) ?? DEFAULT_LANG;
  const tags = Array.isArray(sp.tag) ? sp.tag : sp.tag ? [sp.tag] : [];
  const hoursAgo = parseInt(sp.hours ?? "24", 10);

  const [items, available] = await Promise.all([
    listArticles(env, { category: "ai", q: sp.q, tags, hoursAgo, limit: 60 }),
    listAllTags(env, "ai"),
  ]);

  return (
    <>
      <header className="mb-6">
        <p className="text-[11px] uppercase tracking-[0.18em] text-[var(--ink-3)]">{t("desk", lang)}</p>
        <h1 className="font-display text-3xl md:text-4xl font-semibold tracking-tight mt-1">
          {t("aiTitle", lang)}
        </h1>
        <p className="text-sm text-[var(--ink-3)] mt-2">{t("aiSub", lang)}</p>
      </header>
      <FilterTabs category="ai" availableTags={available} />
      <NewsList articles={items} activeTags={tags} />
    </>
  );
}
