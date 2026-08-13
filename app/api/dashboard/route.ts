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
    hourlyRows, dbTotalRow,
    rwRecentRow, rwTopGroupRows, rwSurgeRows,
  ] = await Promise.all([
    env.DB.prepare("SELECT COUNT(*) as cnt FROM articles WHERE published_at >= ?").bind(cutoff).first(),
    env.DB.prepare("SELECT category, COUNT(*) as cnt FROM articles WHERE published_at >= ? GROUP BY category ORDER BY cnt DESC").bind(cutoff).all(),
    env.DB.prepare(`SELECT source, category, COUNT(*) as cnt FROM articles WHERE published_at >= ? GROUP BY source, category ORDER BY cnt DESC LIMIT 60`).bind(cutoff).all(),
    env.DB.prepare(`SELECT t.name, COUNT(*) as cnt FROM tags t JOIN article_tags at ON t.id = at.tag_id JOIN articles a ON at.article_id = a.id WHERE a.published_at >= ? GROUP BY t.name ORDER BY cnt DESC LIMIT 20`).bind(cutoff).all(),
    env.DB.prepare(`SELECT CAST((strftime('%s','now') - strftime('%s', published_at)) / 3600 AS INTEGER) as hours_ago, CAST((strftime('%H', published_at, '+9 hours')) AS INTEGER) as jst_hour, COUNT(*) as cnt FROM articles WHERE published_at >= datetime('now','-24 hours') GROUP BY hours_ago ORDER BY hours_ago DESC`).all(),
    env.DB.prepare("SELECT COUNT(*) as cnt FROM articles").first(),
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
  ]);

  // Same surge logic as the ransomware page: recent-7d vs prior-7d, min 3
  // recent victims to avoid flagging noise, top 3 by growth.
  const rwSurgeRaw = (rwSurgeRows.results ?? []) as { g: string; bucket: string; cnt: number }[];
  const rwByGroup = new Map<string, { recent: number; prior: number }>();
  for (const row of rwSurgeRaw) {
    const g = row.g || "Unknown";
    const entry = rwByGroup.get(g) ?? { recent: 0, prior: 0 };
    if (row.bucket === "recent") entry.recent += Number(row.cnt);
    else entry.prior += Number(row.cnt);
    rwByGroup.set(g, entry);
  }
  const rwSurging = [...rwByGroup.entries()]
    .filter(([, v]) => v.recent >= 3 && v.recent > v.prior)
    .map(([group, v]) => ({
      group, recent: v.recent, prior: v.prior,
      growthPct: v.prior > 0 ? Math.round(((v.recent - v.prior) / v.prior) * 100) : null,
    }))
    .sort((a, b) => (b.growthPct ?? 9999) - (a.growthPct ?? 9999) || b.recent - a.recent)
    .slice(0, 3);

  const data = {
    hours,
    total:    (totalRow as { cnt: number } | null)?.cnt ?? 0,
    dbTotal:  (dbTotalRow as { cnt: number } | null)?.cnt ?? 0,
    byCategory:     (byCategoryRows.results  ?? []).map(r => r as { category: string; cnt: number }),
    bySource:       (bySourceRows.results    ?? []).map(r => r as { source: string; category: string; cnt: number }),
    trendingTags:   (trendingTagsRows.results ?? []).map(r => r as { name: string; cnt: number }),
    hourly:         (hourlyRows.results      ?? []).map(r => r as { hours_ago: number; jst_hour: number; cnt: number }),
    ransomware: {
      last7d:    (rwRecentRow as { cnt: number } | null)?.cnt ?? 0,
      topGroups: (rwTopGroupRows.results ?? []).map(r => r as { g: string; cnt: number }),
      surging:   rwSurging,
    },
  };

  const response = NextResponse.json(data);
  response.headers.set("Cache-Control", `public, max-age=${CACHE_TTL}`);

  // Store in Cloudflare edge cache
  await cache.put(cacheKey, response.clone());

  return response;
}
