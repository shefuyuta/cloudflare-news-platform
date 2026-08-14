// app/api/dashboard/route.ts
// All counts scoped to the same time window as the news display.
// Results are cached via Cloudflare Cache API for 5 minutes.
import { NextResponse } from "next/server";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import type { Env } from "@/lib/types";

const CACHE_TTL = 300; // 5 minutes

export async function GET(req: Request): Promise<Response> {
  const env = (await getCloudflareContext()).env as unknown as Env;
  const { searchParams } = new URL(req.url);
  const hours  = Math.max(1, parseInt(searchParams.get("hours") ?? "24", 10));

  // ── Cloudflare Cache API ─────────────────────────────────────────────
  const cacheKey = new Request(`https://newshub-cache/dashboard?hours=${hours}`);
  const cache    = await caches.open("dashboard-stats");
  const cached   = await cache.match(cacheKey);
  if (cached) return cached;

  const cutoff = new Date(Date.now() - hours * 3_600_000).toISOString();

  const [
    totalRow, byCategoryRows, bySourceRows, trendingTagsRows,
    hourlyRows, dbTotalRow, sourceHealthRows,
    rwRecentRow, rwTopGroupRows, rwSurgeRows, dormantGroupRows,
    rwRecentJpRow, rwTopGroupJpRows, rwSurgeJpRows,
    tagSurgeRows,
  ] = await Promise.all([
    env.DB.prepare("SELECT COUNT(*) as cnt FROM articles WHERE published_at >= ?").bind(cutoff).first(),
    env.DB.prepare("SELECT category, COUNT(*) as cnt FROM articles WHERE published_at >= ? GROUP BY category ORDER BY cnt DESC").bind(cutoff).all(),
    env.DB.prepare(`SELECT source, category, COUNT(*) as cnt FROM articles WHERE published_at >= ? GROUP BY source, category ORDER BY cnt DESC LIMIT 60`).bind(cutoff).all(),
    env.DB.prepare(`SELECT t.name, COUNT(*) as cnt FROM tags t JOIN article_tags at ON t.id = at.tag_id JOIN articles a ON at.article_id = a.id WHERE a.published_at >= ? GROUP BY t.name ORDER BY cnt DESC LIMIT 20`).bind(cutoff).all(),
    env.DB.prepare(`SELECT CAST((strftime('%s','now') - strftime('%s', published_at)) / 3600 AS INTEGER) as hours_ago, CAST((strftime('%H', published_at, '+9 hours')) AS INTEGER) as jst_hour, COUNT(*) as cnt FROM articles WHERE published_at >= datetime('now','-24 hours') GROUP BY hours_ago ORDER BY hours_ago DESC`).all(),
    env.DB.prepare("SELECT COUNT(*) as cnt FROM articles").first(),
    // Source health: most recent article per source, regardless of the
    // `hours` window — a source that hasn't produced anything in a long
    // time (relative to its own typical cadence) is a sign the feed broke.
    env.DB.prepare(`SELECT source, MAX(published_at) AS latest, COUNT(*) AS total FROM articles GROUP BY source ORDER BY latest DESC`).all(),
    // Ransomware summary (independent of the `hours` window — always last 7d,
    // this is a "this week" pulse, not tied to the news display window).
    env.DB.prepare(`SELECT COUNT(*) AS cnt FROM ransomware_victims WHERE discovered != '' AND julianday('now') - julianday(discovered) < 7`).first(),
    env.DB.prepare(`SELECT group_name AS g, COUNT(*) AS cnt FROM ransomware_victims WHERE discovered != '' AND julianday('now') - julianday(discovered) < 7 GROUP BY g ORDER BY cnt DESC LIMIT 5`).all(),
    env.DB.prepare(`
      SELECT group_name AS g,
             CASE WHEN julianday('now') - julianday(discovered) < 7 THEN 'recent' ELSE 'prior' END AS bucket,
             COUNT(*) AS cnt
      FROM ransomware_victims
      WHERE discovered != '' AND julianday('now') - julianday(discovered) < 14
      GROUP BY g, bucket
    `).all(),
    // Dormant groups: had meaningful activity in the 60-120 day window but
    // NOTHING in the last 60 days. Limited to groups with >=5 victims in
    // that prior window so one-off/inactive-from-the-start groups don't
    // clutter this (a group with 1 victim ever "going dormant" isn't a
    // signal). This is a plain point-in-time query (not a range comparison
    // like surge), so no "recent-vs-prior bucket" shaping is needed.
    env.DB.prepare(`
      SELECT group_name AS g, COUNT(*) AS cnt, MAX(discovered) AS last_seen
      FROM ransomware_victims
      WHERE discovered != ''
      GROUP BY g
      HAVING COUNT(*) >= 5
         AND julianday('now') - julianday(MAX(discovered)) >= 60
         AND julianday('now') - julianday(MAX(discovered)) < 120
      ORDER BY julianday('now') - julianday(MAX(discovered)) ASC
      LIMIT 5
    `).all(),
    // Japan-only variants of the three ransomware queries above, so the
    // dashboard card can toggle Global/Japan without a second round trip.
    env.DB.prepare(`SELECT COUNT(*) AS cnt FROM ransomware_victims WHERE country IN ('JP','Japan','日本') AND discovered != '' AND julianday('now') - julianday(discovered) < 7`).first(),
    env.DB.prepare(`SELECT group_name AS g, COUNT(*) AS cnt FROM ransomware_victims WHERE country IN ('JP','Japan','日本') AND discovered != '' AND julianday('now') - julianday(discovered) < 7 GROUP BY g ORDER BY cnt DESC LIMIT 5`).all(),
    env.DB.prepare(`
      SELECT group_name AS g,
             CASE WHEN julianday('now') - julianday(discovered) < 7 THEN 'recent' ELSE 'prior' END AS bucket,
             COUNT(*) AS cnt
      FROM ransomware_victims
      WHERE country IN ('JP','Japan','日本') AND discovered != '' AND julianday('now') - julianday(discovered) < 14
      GROUP BY g, bucket
    `).all(),
    // Surging tags: same recent-7d vs prior-7d bucket comparison, but on
    // article tags. Excludes control tags (sub:*, AI, Cyber) — those drive
    // routing, not user-facing keywords, and would swamp the real signal.
    env.DB.prepare(`
      SELECT t.name AS g,
             CASE WHEN julianday('now') - julianday(a.published_at) < 7 THEN 'recent' ELSE 'prior' END AS bucket,
             COUNT(*) AS cnt
      FROM tags t
      JOIN article_tags at ON t.id = at.tag_id
      JOIN articles a ON at.article_id = a.id
      WHERE julianday('now') - julianday(a.published_at) < 14
        AND t.name NOT LIKE 'sub:%' AND t.name NOT IN ('AI', 'Cyber')
      GROUP BY g, bucket
    `).all(),
  ]);

  // Shared recent-7d vs prior-7d surge shaping: min 3 recent occurrences to
  // clear the floor (avoids "1 -> 2" reading as a 100% spike), top N by
  // growth. growthPct is null when prior=0 (shown as "new" by the caller).
  function shapeSurge(rows: { g: string; bucket: string; cnt: number }[], minRecent: number, topN: number) {
    const byG = new Map<string, { recent: number; prior: number }>();
    for (const row of rows) {
      const g = row.g || "Unknown";
      const entry = byG.get(g) ?? { recent: 0, prior: 0 };
      if (row.bucket === "recent") entry.recent += Number(row.cnt);
      else entry.prior += Number(row.cnt);
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

  const rwSurging   = shapeSurge((rwSurgeRows.results   ?? []) as { g: string; bucket: string; cnt: number }[], 3, 3);
  const rwSurgingJp = shapeSurge((rwSurgeJpRows.results ?? []) as { g: string; bucket: string; cnt: number }[], 2, 3); // lower floor: JP volume is much smaller
  const tagSurging  = shapeSurge((tagSurgeRows.results  ?? []) as { g: string; bucket: string; cnt: number }[], 3, 5);

  const data = {
    hours,
    total:    (totalRow as { cnt: number } | null)?.cnt ?? 0,
    dbTotal:  (dbTotalRow as { cnt: number } | null)?.cnt ?? 0,
    byCategory:     (byCategoryRows.results  ?? []).map(r => r as { category: string; cnt: number }),
    bySource:       (bySourceRows.results    ?? []).map(r => r as { source: string; category: string; cnt: number }),
    trendingTags:   (trendingTagsRows.results ?? []).map(r => r as { name: string; cnt: number }),
    surgingTags:    tagSurging,
    sourceHealth:   (sourceHealthRows.results ?? []).map(r => {
      const row = r as { source: string; latest: string; total: number };
      const hoursSince = row.latest ? (Date.now() - new Date(row.latest).getTime()) / 3_600_000 : Infinity;
      // Fetch cron runs every 2h, so: <6h = normal (allows for a missed
      // cycle or two), 6-24h = delayed, >24h = likely broken.
      const status: "ok" | "delayed" | "stale" = hoursSince < 6 ? "ok" : hoursSince < 24 ? "delayed" : "stale";
      return { source: row.source, latest: row.latest, total: row.total, hoursSince: Math.round(hoursSince), status };
    }),
    hourly:         (hourlyRows.results      ?? []).map(r => r as { hours_ago: number; jst_hour: number; cnt: number }),
    ransomware: {
      last7d:    (rwRecentRow as { cnt: number } | null)?.cnt ?? 0,
      topGroups: (rwTopGroupRows.results ?? []).map(r => r as { g: string; cnt: number }),
      surging:   rwSurging,
      dormant:   (dormantGroupRows.results ?? []).map(r => {
        const row = r as { g: string; cnt: number; last_seen: string };
        const daysSince = Math.round((Date.now() - new Date(row.last_seen).getTime()) / 86_400_000);
        return { group: row.g, totalVictims: row.cnt, lastSeen: row.last_seen, daysSince };
      }),
      jp: {
        last7d:    (rwRecentJpRow as { cnt: number } | null)?.cnt ?? 0,
        topGroups: (rwTopGroupJpRows.results ?? []).map(r => r as { g: string; cnt: number }),
        surging:   rwSurgingJp,
      },
    },
  };

  const response = NextResponse.json(data);
  response.headers.set("Cache-Control", `public, max-age=${CACHE_TTL}`);

  // Store in Cloudflare edge cache
  await cache.put(cacheKey, response.clone());

  return response;
}
