// app/search/page.tsx
// Full-database search — no time-window restriction.
// Accepts: q, tag, source, category, region, subcategory, important
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { listArticles } from "@/lib/db";
import { NewsList } from "@/components/news/NewsList";
import type { Env } from "@/lib/types";
import type { Category } from "@/lib/categories";
import { cookies } from "next/headers";
import { t, type Lang, DEFAULT_LANG, LANG_COOKIE } from "@/lib/i18n";
export const dynamic = "force-dynamic";

interface SearchParams {
  q?: string;
  tag?: string | string[];
  source?: string;
  category?: string;
  region?: string;
  subcategory?: string;
  important?: string;
}

export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const sp   = await searchParams;
  const env  = (await getCloudflareContext()).env as unknown as Env;
  const cookieStore = await cookies();
  const lang = (cookieStore.get(LANG_COOKIE)?.value as Lang) ?? DEFAULT_LANG;

  const tags = Array.isArray(sp.tag) ? sp.tag : sp.tag ? [sp.tag] : [];

  const items = await listArticles(env, {
    q:           sp.q,
    tags,
    source:      sp.source,
    category:    sp.category as Category | undefined,
    region:      sp.region,
    subcategory: sp.subcategory,
    important:   sp.important === "1",
    noTimeLimit: true,   // search entire DB
    limit:       100,
  });

  // Build human-readable filter description
  const filters: string[] = [];
  if (sp.q)           filters.push(`"${sp.q}"`);
  if (sp.source)      filters.push(sp.source);
  if (sp.category)    filters.push(sp.category);
  if (sp.region)      filters.push(sp.region);
  if (sp.subcategory) filters.push(sp.subcategory);
  if (tags.length)    filters.push(tags.map(t => `#${t}`).join(" "));
  if (sp.important === "1") filters.push(lang === "ja" ? "重要" : "important");

  const hasFilters = filters.length > 0;

  return (
    <>
      <header className="mb-6">
        <p className="text-[11px] uppercase tracking-[0.18em] text-[var(--ink-3)]">
          {t("navSearch", lang)}
        </p>
        <h1 className="font-display text-3xl md:text-4xl font-semibold tracking-tight mt-1">
          {hasFilters
            ? <>{t("searchResultsFor", lang)} <span className="text-[var(--ink-2)]">{filters.join(" · ")}</span></>
            : t("navSearch", lang)
          }
        </h1>
        <p className="text-sm text-[var(--ink-3)] mt-2">
          {hasFilters
            ? `${items.length.toLocaleString()} ${lang === "ja" ? "件 — 全期間の記事が対象" : "results — all time"}`
            : t("searchHint", lang)
          }
        </p>

        {/* Active filter chips */}
        {hasFilters && (
          <div className="flex flex-wrap gap-2 mt-4">
            {sp.q && <FilterChip label={`"${sp.q}"`} href="/search" lang={lang} />}
            {sp.source && <FilterChip label={sp.source} href="/search" lang={lang} />}
            {sp.category && <FilterChip label={sp.category} href="/search" lang={lang} />}
            {tags.map(tag => (
              <FilterChip key={tag} label={`#${tag}`} href="/search" lang={lang} />
            ))}
          </div>
        )}
      </header>

      <NewsList articles={items} activeTags={tags} />
    </>
  );
}

function FilterChip({ label, href, lang }: { label: string; href: string; lang: string }) {
  return (
    <a
      href={href}
      className="inline-flex items-center gap-1.5 px-3 py-1 text-[11px] font-medium rounded-full bg-[var(--ink)] text-white hover:bg-black transition-colors"
    >
      {label}
      <span className="opacity-60 text-[10px]">✕ {lang === "ja" ? "解除" : "clear"}</span>
    </a>
  );
}
