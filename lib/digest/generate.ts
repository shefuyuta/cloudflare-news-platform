// lib/digest/generate.ts
// ---------------------------------------------------------------------
// Generates a Daily/Weekly/Monthly digest: aggregates news + ransomware
// activity for the period, then asks the LLM for ONE bilingual summary
// (JSON {"ja":"...","en":"..."}) so a digest costs exactly one Workers AI
// call regardless of language. Called from the daily cron (worker.ts),
// which always generates 'daily' and additionally 'weekly' on Fridays and
// 'monthly' on the last day of the month (all JST-dated).
// ---------------------------------------------------------------------
import { loadRuntimeConfig } from "../rag/config";
import type { Env } from "../types";

export type DigestType = "daily" | "weekly" | "monthly";

const PERIOD_DAYS: Record<DigestType, number> = { daily: 1, weekly: 7, monthly: 30 };
const PERIOD_LABEL_JA: Record<DigestType, string> = { daily: "デイリー", weekly: "ウィークリー", monthly: "マンスリー" };
const PERIOD_LABEL_EN: Record<DigestType, string> = { daily: "Daily", weekly: "Weekly", monthly: "Monthly" };

export interface DigestResult {
  id: string;
  type: DigestType;
  periodStart: string;
  periodEnd: string;
  contentJa: string;
  contentEn: string;
}

/** Today's date in JST as YYYY-MM-DD, used for both period_end and the
 *  Friday/last-day-of-month checks in worker.ts. */
export function jstDateKey(d: Date = new Date()): string {
  // en-CA locale gives YYYY-MM-DD directly.
  return d.toLocaleDateString("en-CA", { timeZone: "Asia/Tokyo" });
}

export async function generateDigest(env: Env, type: DigestType): Promise<DigestResult> {
  const periodEnd = jstDateKey();
  const days = PERIOD_DAYS[type];
  const periodStart = jstDateKey(new Date(Date.now() - days * 86_400_000));
  const cutoff = new Date(Date.now() - days * 86_400_000).toISOString();

  const stats = await gatherStats(env, cutoff);
  const previous = await fetchPreviousDigestStats(env, type, periodEnd);
  const { ja, en } = await summarize(env, type, stats, previous);

  const id = `${type}-${periodEnd}`;
  await env.DB.prepare(`
    INSERT OR REPLACE INTO digests (id, type, period_start, period_end, content, stats, generated_at)
    VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
  `).bind(id, type, periodStart, periodEnd, JSON.stringify({ ja, en }), JSON.stringify(stats)).run();

  return { id, type, periodStart, periodEnd, contentJa: ja, contentEn: en };
}

/** Load the immediately preceding digest of the same type (by period_end,
 *  excluding today's) so the LLM can note trend continuation/reversal
 *  instead of only reporting a snapshot. Returns null for the very first
 *  digest of a given type, or if the stored stats can't be parsed. */
async function fetchPreviousDigestStats(env: Env, type: DigestType, periodEnd: string): Promise<DigestStats | null> {
  const row = await env.DB.prepare(`
    SELECT stats FROM digests
    WHERE type = ? AND period_end < ?
    ORDER BY period_end DESC
    LIMIT 1
  `).bind(type, periodEnd).first() as { stats: string } | null;
  if (!row?.stats) return null;
  try { return JSON.parse(row.stats) as DigestStats; } catch { return null; }
}

/* ---------- Aggregation ------------------------------------------- */

interface DigestStats {
  totalArticles: number;
  byCategory: { category: string; cnt: number }[];
  topSources: { source: string; cnt: number }[];
  notableStories: { title: string; source: string; summary: string; relatedCount: number }[];  // multi-source coverage = notable
  surgingTags: { tag: string; growthPct: number | null; recent: number }[];
  ransomware: {
    newVictims: number;
    topGroups: { group: string; cnt: number }[];
    surging: { group: string; growthPct: number | null; targetIndustries: string[] }[];
    dormant: { group: string; daysSince: number }[];
  };
}

async function gatherStats(env: Env, cutoff: string): Promise<DigestStats> {
  const [
    totalRow, byCategoryRows, sourceRows, notableRows,
    rwTotalRow, rwTopGroupRows,
  ] = await Promise.all([
    env.DB.prepare("SELECT COUNT(*) AS cnt FROM articles WHERE published_at >= ?").bind(cutoff).first() as Promise<{ cnt: number } | null>,
    env.DB.prepare("SELECT category, COUNT(*) AS cnt FROM articles WHERE published_at >= ? GROUP BY category ORDER BY cnt DESC").bind(cutoff).all(),
    env.DB.prepare("SELECT source, COUNT(*) AS cnt FROM articles WHERE published_at >= ? GROUP BY source ORDER BY cnt DESC LIMIT 8").bind(cutoff).all(),
    // "Notable" = multiple sources covered it (has related_articles links),
    // most-linked first. This is the same signal the "+N more" badge uses.
    env.DB.prepare(`
      SELECT a.title, a.source, a.summary, r.cnt AS related_count
      FROM articles a
      JOIN (
        SELECT id, COUNT(*) AS cnt FROM (
          SELECT article_id AS id FROM related_articles
          UNION ALL
          SELECT related_id AS id FROM related_articles
        ) GROUP BY id
      ) r ON r.id = a.id
      WHERE a.published_at >= ?
      ORDER BY r.cnt DESC
      LIMIT 6
    `).bind(cutoff).all(),
    env.DB.prepare("SELECT COUNT(*) AS cnt FROM ransomware_victims WHERE discovered >= ?").bind(cutoff).first() as Promise<{ cnt: number } | null>,
    env.DB.prepare("SELECT group_name AS g, COUNT(*) AS cnt FROM ransomware_victims WHERE discovered >= ? GROUP BY g ORDER BY cnt DESC LIMIT 5").bind(cutoff).all(),
  ]);

  // Surging tags reuse the dashboard's recent-vs-prior logic, scoped to
  // this digest's period vs the period immediately before it (not always
  // 7-vs-7 like the dashboard — a monthly digest compares 30d vs prior 30d).
  const periodMs = Date.now() - new Date(cutoff).getTime();
  const priorCutoff = new Date(Date.now() - periodMs * 2).toISOString();
  const tagRows = await env.DB.prepare(`
    SELECT t.name AS g,
           CASE WHEN a.published_at >= ? THEN 'recent' ELSE 'prior' END AS bucket,
           COUNT(*) AS cnt
    FROM tags t JOIN article_tags at ON t.id = at.tag_id JOIN articles a ON at.article_id = a.id
    WHERE a.published_at >= ? AND t.name NOT LIKE 'sub:%' AND t.name NOT IN ('AI','Cyber')
    GROUP BY g, bucket
  `).bind(cutoff, priorCutoff).all();
  const surgingTags = shapeSurge((tagRows.results ?? []) as { g: string; bucket: string; cnt: number }[], 2, 5)
    .map(s => ({ tag: s.group, growthPct: s.growthPct, recent: s.recent }));

  const rwSurgeRows = await env.DB.prepare(`
    SELECT group_name AS g,
           CASE WHEN discovered >= ? THEN 'recent' ELSE 'prior' END AS bucket,
           COUNT(*) AS cnt
    FROM ransomware_victims
    WHERE discovered >= ?
    GROUP BY g, bucket
  `).bind(cutoff, priorCutoff).all();
  const rwSurgingBase = shapeSurge((rwSurgeRows.results ?? []) as { g: string; bucket: string; cnt: number }[], 3, 5)
    .map(s => ({ group: s.group, growthPct: s.growthPct }));

  // For each surging group, what industries has it hit THIS period? Gives
  // the digest something concrete to point at ("X is currently focused on
  // healthcare") instead of just a growth percentage. Capped to top 2 per
  // group so this stays a quick pointer, not a full breakdown.
  const rwSurging = await Promise.all(rwSurgingBase.map(async s => {
    const rows = await env.DB.prepare(`
      SELECT activity, COUNT(*) AS cnt FROM ransomware_victims
      WHERE group_name = ? AND discovered >= ? AND activity IS NOT NULL AND activity NOT IN ('', 'Not Found')
      GROUP BY activity ORDER BY cnt DESC LIMIT 2
    `).bind(s.group, cutoff).all();
    const targetIndustries = (rows.results ?? []).map(r => (r as { activity: string }).activity);
    return { ...s, targetIndustries };
  }));

  const dormantRows = await env.DB.prepare(`
    SELECT group_name AS g, COUNT(*) AS cnt, MAX(discovered) AS last_seen
    FROM ransomware_victims
    WHERE discovered != ''
    GROUP BY g
    HAVING COUNT(*) >= 5
       AND julianday('now') - julianday(MAX(discovered)) >= 60
       AND julianday('now') - julianday(MAX(discovered)) < 120
    ORDER BY julianday('now') - julianday(MAX(discovered)) ASC
    LIMIT 3
  `).all();

  return {
    totalArticles: totalRow?.cnt ?? 0,
    byCategory: (byCategoryRows.results ?? []).map(r => r as { category: string; cnt: number }),
    topSources: (sourceRows.results ?? []).map(r => r as { source: string; cnt: number }),
    notableStories: (notableRows.results ?? []).map(r => {
      const row = r as { title: string; source: string; summary: string | null; related_count: number };
      // Cap length so 6 story summaries don't balloon the prompt — this is
      // meant to give the LLM enough to say WHY it's notable, not a full
      // rewrite of the article.
      const summary = (row.summary ?? "").slice(0, 200);
      return { title: row.title, source: row.source, summary, relatedCount: row.related_count };
    }),
    surgingTags,
    ransomware: {
      newVictims: rwTotalRow?.cnt ?? 0,
      topGroups: (rwTopGroupRows.results ?? []).map(r => r as { g: string; cnt: number }).map(r => ({ group: r.g, cnt: r.cnt })),
      surging: rwSurging,
      dormant: (dormantRows.results ?? []).map(r => {
        const row = r as { g: string; last_seen: string };
        const daysSince = Math.round((Date.now() - new Date(row.last_seen).getTime()) / 86_400_000);
        return { group: row.g, daysSince };
      }),
    },
  };
}

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

/* ---------- LLM summarization -------------------------------------- */

/** Builds a "PREVIOUS PERIOD" facts block for the prompt: raw numbers plus
 *  the delta, so the LLM can characterize direction/magnitude of change
 *  without doing its own arithmetic (which it'd sometimes get wrong).
 *  Returns "" when there's no previous digest to compare against. */
function buildComparisonFacts(type: DigestType, stats: DigestStats, previous: DigestStats | null): string {
  if (!previous) return "";

  const articleDelta = stats.totalArticles - previous.totalArticles;
  const victimDelta = stats.ransomware.newVictims - previous.ransomware.newVictims;
  const prevTopGroup = previous.ransomware.topGroups[0]?.group ?? null;
  const currTopGroup = stats.ransomware.topGroups[0]?.group ?? null;
  const topGroupChanged = prevTopGroup && currTopGroup && prevTopGroup !== currTopGroup;

  // Groups that were surging last period too — a continuing trend, not new.
  const prevSurgingGroups = new Set(previous.ransomware.surging.map(g => g.group));
  const stillSurging = stats.ransomware.surging.filter(g => prevSurgingGroups.has(g.group)).map(g => g.group);

  return `
PREVIOUS PERIOD (immediately preceding ${PERIOD_LABEL_EN[type].toLowerCase()}):
Total articles: ${previous.totalArticles} (change: ${articleDelta >= 0 ? "+" : ""}${articleDelta})
New ransomware victims: ${previous.ransomware.newVictims} (change: ${victimDelta >= 0 ? "+" : ""}${victimDelta})
Top group then: ${prevTopGroup ?? "none"}${topGroupChanged ? ` -> now: ${currTopGroup} (changed)` : currTopGroup ? " (unchanged)" : ""}
Groups surging in BOTH this period and the previous one (continuing trend): ${stillSurging.join(", ") || "none"}
`.trim();
}

async function summarize(env: Env, type: DigestType, stats: DigestStats, previous: DigestStats | null): Promise<{ ja: string; en: string }> {
  const cfg = await loadRuntimeConfig(env);

  const facts = `
Period: ${PERIOD_LABEL_EN[type]}
Total articles: ${stats.totalArticles}
By category: ${stats.byCategory.map(c => `${c.category}=${c.cnt}`).join(", ") || "none"}
Top sources: ${stats.topSources.map(s => `${s.source} (${s.cnt})`).join(", ") || "none"}
Notable multi-source stories (covered by multiple outlets):
${stats.notableStories.map(s => `- "${s.title}" (${s.source}, +${s.relatedCount} more sources): ${s.summary || "(no summary available)"}`).join("\n") || "none"}
Surging tags/keywords: ${stats.surgingTags.map(s => `${s.tag} (${s.growthPct !== null ? `+${s.growthPct}%` : "new"})`).join(", ") || "none"}

Ransomware activity:
New victims: ${stats.ransomware.newVictims}
Top groups: ${stats.ransomware.topGroups.map(g => `${g.group} (${g.cnt})`).join(", ") || "none"}
Surging groups: ${stats.ransomware.surging.map(g => `${g.group} (${g.growthPct !== null ? `+${g.growthPct}%` : "new"}${g.targetIndustries.length ? `, hitting: ${g.targetIndustries.join("/")}` : ""})`).join(", ") || "none"}
Groups gone quiet (60+ days no new victims): ${stats.ransomware.dormant.map(g => `${g.group} (${g.daysSince}d)`).join(", ") || "none"}
${buildComparisonFacts(type, stats, previous)}
`.trim();

  const comparisonInstruction = previous
    ? "A PREVIOUS PERIOD comparison is included below the current facts — use it to note whether trends are continuing, reversing, or new (e.g. \"unlike last week, X has now overtaken Y\" or \"the surge in X continued for a second period\"). Don't just restate both numbers side by side; say what changed and whether that's a continuation or a reversal."
    : "This is the first digest of this type, so there's no prior period to compare against — just report the current period.";

  const systemPrompt = `You are writing a ${PERIOD_LABEL_EN[type]} cybersecurity news digest for a security engineer.
Use ONLY the facts given below — do not invent article titles, numbers, or events not listed.
Write 3-6 short sentences: lead with the most notable development — use its summary to say WHAT actually happened and why it matters, not just that it was covered by multiple outlets — then key numbers/trends, then anything unusual (surges, dormant groups).
${comparisonInstruction}
Keep it dense and factual, not fluffy. No headers, no bullet points — plain prose paragraph(s).
If a surging group has listed target industries, you may add ONE brief, hedged observation tied directly to that data (e.g. "healthcare organizations may want to note X's current focus there") — never a general security recommendation, never phrased as certain or prescriptive, and only when the underlying data (industries hit) is actually present. Skip this entirely if there's nothing concrete to point at.

Respond with ONLY a JSON object, no markdown fences, no other text:
{"ja": "<Japanese version>", "en": "<English version>"}

FACTS:
${facts}`;

  try {
    const result = await (env.AI as { run: (m: string, o: object) => Promise<unknown> }).run(cfg.llmModel, {
      messages: [{ role: "system", content: systemPrompt }, { role: "user", content: "Write the digest." }],
      temperature: 0.4,
      max_tokens: 700,
    });

    // Defensive: `result.response` is USUALLY a string, but some Workers AI
    // models/configs can return it as something else (an object, or the
    // response text nested elsewhere), which crashed `.trim()` with
    // "not a function" in production. Log the full result shape once so
    // that's diagnosable, then coerce to a string rather than assuming.
    const resultObj = result as { response?: unknown } | null;
    const responseValue = resultObj?.response;
    if (typeof responseValue !== "string") {
      console.warn(`[digest] LLM result.response for ${type} was not a string (got ${typeof responseValue}). Full result:`, JSON.stringify(result).slice(0, 1500));
    }
    const raw = (typeof responseValue === "string" ? responseValue : JSON.stringify(responseValue ?? "")).trim();
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    const parsed = jsonMatch ? JSON.parse(jsonMatch[0]) : null;
    if (parsed?.ja && parsed?.en) return { ja: parsed.ja, en: parsed.en };
    // Parsing "succeeded" (or found nothing to parse) but didn't produce
    // usable ja/en fields — this previously fell through to the fallback
    // SILENTLY (no catch triggered, no log), making it invisible which
    // digests were LLM-generated vs. fallback. Log the raw response so a
    // format-deviation (extra prose, wrong keys, truncation) is diagnosable.
    console.warn(`[digest] LLM response for ${type} didn't yield usable ja/en. Raw response:`, raw.slice(0, 1000));
  } catch (e) {
    console.warn(`[digest] LLM summarization failed for ${type}:`, e);
  }

  // Fallback: a plain factual sentence if the LLM call/parse fails, so a
  // digest row still gets written rather than silently skipped.
  const fallbackJa = `${PERIOD_LABEL_JA[type]}ダイジェスト: 記事${stats.totalArticles}件、ランサムウェア新規被害${stats.ransomware.newVictims}件。`;
  const fallbackEn = `${PERIOD_LABEL_EN[type]} digest: ${stats.totalArticles} articles, ${stats.ransomware.newVictims} new ransomware victims.`;
  return { ja: fallbackJa, en: fallbackEn };
}
