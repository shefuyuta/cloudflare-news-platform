// app/ai-security/page.tsx
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { listArticles, listAllTags } from "@/lib/db";
import { NewsList } from "@/components/news/NewsList";
import { FilterTabs } from "@/components/news/FilterTabs";
import type { Env } from "@/lib/types";
import { cookies } from "next/headers";
import { t, type Lang, DEFAULT_LANG, LANG_COOKIE } from "@/lib/i18n";
export const dynamic = "force-dynamic";

// Same recent-vs-prior-7d surge shaping used on the Dashboard and in the
// digest generator, duplicated here (small enough not to warrant a shared
// module) rather than scoped by importing a client-side dashboard file.
function shapeSurge(rows: { g: string; bucket: string; cnt: number }[], minRecent: number, topN: number) {
  const byG = new Map<string, { recent: number; prior: number }>();
  for (const row of rows) {
    const g = row.g || "Unknown";
    const entry = byG.get(g) ?? { recent: 0, prior: 0 };
    if (row.bucket === "recent") entry.recent += Number(row.cnt); else entry.prior += Number(row.cnt);
    byG.set(g, entry);
  }
  return [...byG.entries()]
    .filter(([, v]) => v.recent >= minRecent && v.recent > v.prior)
    .map(([group, v]) => ({
      group, recent: v.recent, prior: v.prior,
      growthPct: v.prior > 0 ? Math.round(((v.recent - v.prior) / v.prior) * 100) : null,
    }))
    .sort((a, b) => (b.growthPct ?? 9999) - (a.growthPct ?? 9999) || b.recent - a.recent)
    .slice(0, topN);
}

const AI_SECURITY_WHERE = `(
  (a.category = 'ai' AND EXISTS (
    SELECT 1 FROM article_tags atx JOIN tags tx ON atx.tag_id = tx.id
    WHERE atx.article_id = a.id AND tx.name = 'Cyber'
  ))
  OR
  (a.category = 'cybersecurity' AND EXISTS (
    SELECT 1 FROM article_tags aty JOIN tags ty ON aty.tag_id = ty.id
    WHERE aty.article_id = a.id AND ty.name = 'AI'
  ))
)`;

export default async function AiSecurityPage({ searchParams }: {
  searchParams: Promise<{ q?: string; tag?: string | string[]; hours?: string; page?: string; pageSize?: string }>;
}) {
  const sp   = await searchParams;
  const env  = (await getCloudflareContext()).env as unknown as Env;
  const cookieStore = await cookies();
  const lang = (cookieStore.get(LANG_COOKIE)?.value as Lang) ?? DEFAULT_LANG;
  const tags = Array.isArray(sp.tag) ? sp.tag : sp.tag ? [sp.tag] : [];
  const hoursAgo = parseInt(sp.hours ?? "24", 10);
  const cutoff = new Date(Date.now() - hoursAgo * 3_600_000).toISOString();
  const priorCutoff = new Date(Date.now() - hoursAgo * 2 * 3_600_000).toISOString();

  const [items, available, tagSurgeRows, sourceRows] = await Promise.all([
    listArticles(env, { aiSecurityOnly: true, q: sp.q, tags, hoursAgo, limit: 200 }),
    listAllTags(env, undefined, { hoursAgo, aiSecurityOnly: true }),
    // Surging tags/keywords, scoped to the AI×Security intersection only —
    // same recent-vs-prior comparison as the Dashboard, but restricted to
    // this subset so e.g. a general-news spike doesn't show up here.
    env.DB.prepare(`
      SELECT t.name AS g,
             CASE WHEN a.published_at >= ? THEN 'recent' ELSE 'prior' END AS bucket,
             COUNT(*) AS cnt
      FROM tags t
      JOIN article_tags at ON t.id = at.tag_id
      JOIN articles    a  ON at.article_id = a.id
      WHERE a.published_at >= ? AND t.name NOT LIKE 'sub:%' AND t.name NOT IN ('AI', 'Cyber')
        AND ${AI_SECURITY_WHERE}
      GROUP BY g, bucket
    `).bind(cutoff, priorCutoff).all(),
    // "Vendor activity" = which sources are covering this intersection, and
    // how much — a quick read on who's publishing about AI security right
    // now (useful for competitive/partner awareness).
    env.DB.prepare(`
      SELECT a.source, COUNT(*) AS cnt
      FROM articles a
      WHERE a.published_at >= ? AND ${AI_SECURITY_WHERE}
      GROUP BY a.source ORDER BY cnt DESC LIMIT 10
    `).bind(cutoff).all(),
  ]);

  const surgingTags = shapeSurge((tagSurgeRows.results ?? []) as { g: string; bucket: string; cnt: number }[], 2, 6);
  const vendors = (sourceRows.results ?? []).map(r => r as { source: string; cnt: number });
  const maxVendor = Math.max(...vendors.map(v => v.cnt), 1);

  return (
    <>
      <header className="mb-6">
        <h1 className="font-display text-3xl md:text-4xl font-semibold tracking-tight">
          {t("aiSecurityTitle", lang)}
        </h1>
        <p className="text-sm text-[var(--ink-3)] mt-2">{t("aiSecuritySub", lang)}</p>
      </header>

      {surgingTags.length > 0 && (
        <div className="mb-4">
          <p className="text-[11px] uppercase tracking-widest text-[var(--ink-3)] mb-2">
            {t("aiSecuritySurging", lang)}
          </p>
          <div className="flex flex-wrap gap-2">
            {surgingTags.map(s => (
              <a
                key={s.group}
                href={`/ai-security?tag=${encodeURIComponent(s.group)}`}
                className="inline-flex items-center gap-1.5 text-[11px] font-medium px-2.5 py-1 rounded-full bg-red-50 text-red-700 ring-1 ring-inset ring-red-200 hover:bg-red-100 transition-colors"
              >
                <span className="inline-block w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
                {s.group}
                <span className="opacity-70">
                  {s.growthPct !== null ? `+${s.growthPct}%` : (lang === "ja" ? "新規" : "new")}
                </span>
              </a>
            ))}
          </div>
        </div>
      )}

      {vendors.length > 0 && (
        <div className="mb-6 border hairline rounded-lg p-4">
          <p className="text-[11px] uppercase tracking-widest text-[var(--ink-3)] mb-3">
            {t("aiSecurityVendors", lang)}
          </p>
          <div className="space-y-1.5">
            {vendors.map(v => (
              <div key={v.source} className="flex items-center gap-3">
                <span className="text-[12px] font-mono text-[var(--ink-2)] w-32 truncate flex-shrink-0">{v.source}</span>
                <div className="flex-1 h-3 bg-[var(--line-soft)] rounded-sm overflow-hidden">
                  <div
                    className="h-full rounded-sm bg-[var(--ink)] animate-bar"
                    style={{ width: `${(v.cnt / maxVendor) * 100}%`, opacity: 0.4 + (v.cnt / maxVendor) * 0.6 }}
                  />
                </div>
                <span className="text-[11px] font-bold tabular-nums text-[var(--ink-2)] w-6 text-right flex-shrink-0">{v.cnt}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <FilterTabs category="ai-security" availableTags={available} />
      <NewsList articles={items} activeTags={tags} />
    </>
  );
}
