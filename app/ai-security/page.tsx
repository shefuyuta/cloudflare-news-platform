// app/ai-security/page.tsx
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { listArticles, listAllTags } from "@/lib/db";
import { NewsList } from "@/components/news/NewsList";
import { FilterTabs } from "@/components/news/FilterTabs";
import { TechniqueTrendChart } from "@/components/ai-security/TechniqueTrendChart";
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

  const [items, available, tagSurgeRows, techniqueMonthRows] = await Promise.all([
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
    // Month x AI-attack-technique breakdown, full history (not scoped by
    // the range filter) — powers the technique trend chart. tech:* tags
    // are only ever assigned within ai/cybersecurity articles (see
    // embed-missing.ts), so no need to re-apply AI_SECURITY_WHERE here.
    env.DB.prepare(`
      SELECT
        substr(a.published_at,1,7) || '-' ||
        (CASE WHEN CAST(strftime('%d', a.published_at) AS INTEGER) <= 15 THEN '01' ELSE '16' END) AS m,
        t.name AS g, COUNT(*) AS c
      FROM articles a
      JOIN article_tags at ON at.article_id = a.id
      JOIN tags t ON t.id = at.tag_id
      WHERE t.name LIKE 'tech:%'
      GROUP BY m, g
    `).all(),
  ]);

  const surgingTags = shapeSurge((tagSurgeRows.results ?? []) as { g: string; bucket: string; cnt: number }[], 2, 6);

  // Shape technique trend: unlike the ransomware group trend (top-5 by
  // volume), there are only 4 fixed technique labels, so show all of them
  // rather than picking a subset — a label with 0 articles still draws a
  // flat line at 0, which is informative (this technique hasn't shown up).
  const techRows = (techniqueMonthRows.results ?? []) as { m: string; g: string; c: number }[];
  const techMonthsSet = new Set<string>();
  for (const row of techRows) if (row.m) techMonthsSet.add(row.m);
  // Half-month buckets now (see the query above), so 24 buckets ≈ 12 months
  // of history — same real-world span as before, just finer-grained, which
  // matters early on when only a few weeks of data exist (one monthly point
  // isn't a "trend"; two half-month points at least draw a line).
  const techMonths = [...techMonthsSet].sort().slice(-24);
  const techMonthIdx = new Map(techMonths.map((m, i) => [m, i]));
  const techLabels = ["tech:phishing-genai", "tech:deepfake", "tech:model-attack", "tech:ai-automation"];
  const techSeriesMap = new Map<string, number[]>();
  for (const label of techLabels) techSeriesMap.set(label, new Array(techMonths.length).fill(0));
  for (const row of techRows) {
    const i = techMonthIdx.get(row.m);
    if (i === undefined) continue;
    const series = techSeriesMap.get(row.g);
    if (series) series[i] += Number(row.c);
  }
  const TECH_LABEL_TEXT: Record<string, { en: string; ja: string }> = {
    "tech:phishing-genai": { en: "Generative-AI phishing", ja: "生成AIフィッシング" },
    "tech:deepfake":       { en: "Deepfake fraud",         ja: "ディープフェイク詐欺" },
    "tech:model-attack":   { en: "Attacks on AI models",   ja: "AIモデルへの攻撃" },
    "tech:ai-automation":  { en: "AI-automated attacks",   ja: "AIによる攻撃自動化" },
  };
  const techniqueTrend = {
    months: techMonths,
    series: techLabels.map((label, idx) => ({
      label: lang === "ja" ? TECH_LABEL_TEXT[label].ja : TECH_LABEL_TEXT[label].en,
      points: techSeriesMap.get(label)!,
      color: ["#dc2626", "#7c3aed", "#0891b2", "#059669"][idx],
    })),
  };
  const hasTechniqueData = techniqueTrend.series.some(s => s.points.some(p => p > 0));

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
            <span className="normal-case tracking-normal opacity-60 ml-1.5">
              ({lang === "ja" ? `過去${hoursAgo}時間` : `last ${hoursAgo}h`})
            </span>
          </p>
          <p className="text-[11px] text-[var(--ink-3)] mb-2">
            {lang === "ja"
              ? `直近${hoursAgo}時間の件数が、その前の${hoursAgo}時間より増えているキーワード。`
              : `Keywords whose count in the last ${hoursAgo}h is higher than the ${hoursAgo}h before that.`}
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

      {hasTechniqueData && (
        <div className="mb-6 border hairline rounded-lg p-5">
          <p className="text-[11px] uppercase tracking-widest text-[var(--ink-3)] mb-1">
            {lang === "ja" ? "AI攻撃手法の推移" : "AI Attack Technique Trend"}
          </p>
          <p className="text-[10px] normal-case tracking-normal text-[var(--ink-4)] mb-3">
            {lang === "ja"
              ? "AIによる自動分類に基づく集計です。参考情報としてご覧ください。"
              : "Based on automated AI classification — for reference only."}
          </p>
          <TechniqueTrendChart data={techniqueTrend} lang={lang} />
        </div>
      )}

      <FilterTabs category="ai-security" availableTags={available} />
      <NewsList articles={items} activeTags={tags} />
    </>
  );
}
