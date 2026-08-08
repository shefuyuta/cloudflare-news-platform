// app/page.tsx — Latest: past 12 hours only
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { listArticles } from "@/lib/db";
import { NewsList } from "@/components/news/NewsList";
import type { Env } from "@/lib/types";
import { cookies } from "next/headers";
import { t, type Lang, DEFAULT_LANG, LANG_COOKIE } from "@/lib/i18n";
export const dynamic = "force-dynamic";

export default async function HomePage({ searchParams }: {
  searchParams: Promise<{ q?: string; tag?: string | string[] }>;
}) {
  const sp   = await searchParams;
  const env  = (await getCloudflareContext()).env as unknown as Env;
  const cookieStore = await cookies();
  const lang = (cookieStore.get(LANG_COOKIE)?.value as Lang) ?? DEFAULT_LANG;
  const tags = Array.isArray(sp.tag) ? sp.tag : sp.tag ? [sp.tag] : [];
  const items = await listArticles(env, { q: sp.q, tags, hoursAgo: 12, limit: 200 });

  return (
    <>
      <header className="mb-6">
        <h1 className="font-display text-3xl md:text-4xl font-semibold tracking-tight">
          {t("todaysEdition", lang)}
        </h1>
        <p className="text-sm text-[var(--ink-3)] mt-2">{t("todaysEditionSub", lang)}</p>
      </header>
      <NewsList articles={items} activeTags={tags} />
    </>
  );
}
