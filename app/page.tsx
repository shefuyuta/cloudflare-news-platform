// app/page.tsx — Latest: past 12 hours only
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { listArticles, countArticles, getVolumeSummary } from "@/lib/db";
import { NewsList } from "@/components/news/NewsList";
import { VolumeSummary } from "@/components/news/VolumeSummary";
import { CategoryQuickFilter } from "@/components/news/CategoryQuickFilter";
import type { Env } from "@/lib/types";
import { cookies } from "next/headers";
import { t, type Lang, DEFAULT_LANG, LANG_COOKIE } from "@/lib/i18n";
export const dynamic = "force-dynamic";

const HOURS_AGO = 12;

export default async function HomePage({ searchParams }: {
  searchParams: Promise<{ q?: string; tag?: string | string[]; category?: string; page?: string; pageSize?: string }>;
}) {
  const sp   = await searchParams;
  const env  = (await getCloudflareContext()).env as unknown as Env;
  const cookieStore = await cookies();
  const lang = (cookieStore.get(LANG_COOKIE)?.value as Lang) ?? DEFAULT_LANG;
  const tags = Array.isArray(sp.tag) ? sp.tag : sp.tag ? [sp.tag] : [];
  const page = Math.max(1, parseInt(sp.page ?? "1", 10) || 1);
  const pageSize = [20, 50, 100].includes(parseInt(sp.pageSize ?? "20", 10)) ? parseInt(sp.pageSize ?? "20", 10) : 20;
  // category is a lightweight quick-filter (see CategoryQuickFilter) —
  // unlike the desk pages, the homepage mixes all three by design, so this
  // narrows to one without changing hoursAgo or adding sub-tabs/tags.
  const category = ["general", "cybersecurity", "ai"].includes(sp.category ?? "")
    ? (sp.category as "general" | "cybersecurity" | "ai")
    : undefined;
  const query = { q: sp.q, tags, hoursAgo: HOURS_AGO, category };
  const [items, totalCount, volume] = await Promise.all([
    listArticles(env, { ...query, limit: pageSize, offset: (page - 1) * pageSize }),
    countArticles(env, query),
    // Volume summary is intentionally UNFILTERED by category — it's meant
    // to show "what's in the full last-12h window" regardless of which
    // slice the person is currently viewing, same idea as a dashboard KPI
    // staying stable while the list below it gets filtered.
    getVolumeSummary(env, HOURS_AGO),
  ]);

  return (
    <>
      <header className="mb-6">
        <h1 className="font-display text-3xl md:text-4xl font-semibold tracking-tight">
          {t("todaysEdition", lang)}
        </h1>
        <p className="text-sm text-[var(--ink-3)] mt-2">{t("todaysEditionSub", lang)}</p>
      </header>
      <VolumeSummary
        byCategory={volume.byCategory}
        bySource={volume.bySource}
        total={volume.total}
        hoursAgo={HOURS_AGO}
        lang={lang}
      />
      <CategoryQuickFilter lang={lang} />
      <NewsList articles={items} totalCount={totalCount} page={page} pageSize={pageSize as 20 | 50 | 100} activeTags={tags} />
    </>
  );
}
