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
  const { ja, en } = await summarize(env, type, stats);

  const id = `${type}-${periodEnd}`;
  await env.DB.prepare(`
    INSERT OR REPLACE INTO digests (id, type, period_start, period_end, content, stats, generated_at)
    VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
  `).bind(id, type, periodStart, periodEnd, JSON.stringify({ ja, en }), JSON.stringify(stats)).run();

  return { id, type, periodStart, periodEnd, contentJa: ja, contentEn: en };
}

/* ---------- Aggregation ------------------------------------------- */

interface DigestStats {
  totalArticles: number;
  byCategory: { category: string; cnt: number }[];
  topSources: { source: string; cnt: number }[];
  notableStories: { title: string; source: string; relatedCount: number }[];  // multi-source coverage = notable
  surgingTags: { tag: string; growthPct: number | null; recent: number }[];
  ransomware: {
    newVictims: number;
    topGroups: { group: string; cnt: number }[];
    surging: { group: string; growthPct: number | null }[];
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
      SELECT a.title, a.source, r.cnt AS related_count
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
  const rwSurging = shapeSurge((rwSurgeRows.results ?? []) as { g: string; bucket: string; cnt: number }[], 3, 5)
    .map(s => ({ group: s.group, growthPct: s.growthPct }));

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
      const row = r as { title: string; source: string; related_count: number };
      return { title: row.title, source: row.source, relatedCount: row.related_count };
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

async function summarize(env: Env, type: DigestType, stats: DigestStats): Promise<{ ja: string; en: string }> {
  const cfg = await loadRuntimeConfig(env);

  const facts = `
Period: ${PERIOD_LABEL_EN[type]}
Total articles: ${stats.totalArticles}
By category: ${stats.byCategory.map(c => `${c.category}=${c.cnt}`).join(", ") || "none"}
Top sources: ${stats.topSources.map(s => `${s.source} (${s.cnt})`).join(", ") || "none"}
Notable multi-source stories: ${stats.notableStories.map(s => `"${s.title}" (${s.source}, +${s.relatedCount} more sources)`).join("; ") || "none"}
Surging tags/keywords: ${stats.surgingTags.map(s => `${s.tag} (${s.growthPct !== null ? `+${s.growthPct}%` : "new"})`).join(", ") || "none"}

Ransomware activity:
New victims: ${stats.ransomware.newVictims}
Top groups: ${stats.ransomware.topGroups.map(g => `${g.group} (${g.cnt})`).join(", ") || "none"}
Surging groups: ${stats.ransomware.surging.map(g => `${g.group} (${g.growthPct !== null ? `+${g.growthPct}%` : "new"})`).join(", ") || "none"}
Groups gone quiet (60+ days no new victims): ${stats.ransomware.dormant.map(g => `${g.group} (${g.daysSince}d)`).join(", ") || "none"}
`.trim();

  const systemPrompt = `You are writing a ${PERIOD_LABEL_EN[type]} cybersecurity news digest for a security engineer.
Use ONLY the facts given below — do not invent article titles, numbers, or events not listed.
Write 3-6 short sentences: lead with the most notable development, then key numbers/trends, then anything unusual (surges, dormant groups).
Keep it dense and factual, not fluffy. No headers, no bullet points — plain prose paragraph(s).

Respond with ONLY a JSON object, no markdown fences, no other text:
{"ja": "<Japanese version>", "en": "<English version>"}

FACTS:
${facts}`;

  try {
    const result = await (env.AI as { run: (m: string, o: object) => Promise<unknown> }).run(cfg.llmModel, {
      messages: [{ role: "system", content: systemPrompt }, { role: "user", content: "Write the digest." }],
      temperature: 0.4,
      max_tokens: 700,
    }) as { response?: string };

    const raw = (result?.response ?? "").trim();
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    const parsed = jsonMatch ? JSON.parse(jsonMatch[0]) : null;
    if (parsed?.ja && parsed?.en) return { ja: parsed.ja, en: parsed.en };
  } catch (e) {
    console.warn(`[digest] LLM summarization failed for ${type}:`, e);
  }

  // Fallback: a plain factual sentence if the LLM call/parse fails, so a
  // digest row still gets written rather than silently skipped.
  const fallbackJa = `${PERIOD_LABEL_JA[type]}ダイジェスト: 記事${stats.totalArticles}件、ランサムウェア新規被害${stats.ransomware.newVictims}件。`;
  const fallbackEn = `${PERIOD_LABEL_EN[type]} digest: ${stats.totalArticles} articles, ${stats.ransomware.newVictims} new ransomware victims.`;
  return { ja: fallbackJa, en: fallbackEn };
}
