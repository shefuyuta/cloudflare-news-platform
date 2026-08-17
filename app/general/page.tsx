// app/general/page.tsx
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { listArticles, listAllTags } from "@/lib/db";
import { NewsList } from "@/components/news/NewsList";
import { FilterTabs } from "@/components/news/FilterTabs";
import type { Env } from "@/lib/types";
import { cookies } from "next/headers";
import { t, type Lang, DEFAULT_LANG, LANG_COOKIE } from "@/lib/i18n";
export const dynamic = "force-dynamic";

export default async function GeneralPage({ searchParams }: {
  searchParams: Promise<{ region?: string; q?: string; tag?: string | string[]; hours?: string; page?: string; pageSize?: string }>;
}) {
  const sp   = await searchParams;
  const env  = (await getCloudflareContext()).env as unknown as Env;
  const cookieStore = await cookies();
  const lang = (cookieStore.get(LANG_COOKIE)?.value as Lang) ?? DEFAULT_LANG;
  const tags = Array.isArray(sp.tag) ? sp.tag : sp.tag ? [sp.tag] : [];
  const hoursAgo = parseInt(sp.hours ?? "24", 10);

  const [items, available] = await Promise.all([
    listArticles(env, { category: "general", region: sp.region, q: sp.q, tags, hoursAgo, limit: 200 }),
    listAllTags(env, "general", { hoursAgo, region: sp.region }),
  ]);

  return (
    <>
      <header className="mb-6">
        <h1 className="font-display text-3xl md:text-4xl font-semibold tracking-tight">
          {t("generalTitle", lang)}
        </h1>
        <p className="text-sm text-[var(--ink-3)] mt-2">{t("generalSub", lang)}</p>
      </header>
      <FilterTabs category="general" availableTags={available} />
      <NewsList articles={items} activeTags={tags} />
    </>
  );
}
