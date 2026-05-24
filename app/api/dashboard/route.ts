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
    hourlyRows, importanceDistRows, dbTotalRow,
  ] = await Promise.all([
    env.DB.prepare("SELECT COUNT(*) as cnt FROM articles WHERE published_at >= ?").bind(cutoff).first(),
    env.DB.prepare("SELECT category, COUNT(*) as cnt FROM articles WHERE published_at >= ? GROUP BY category ORDER BY cnt DESC").bind(cutoff).all(),
    env.DB.prepare(`SELECT source, category, COUNT(*) as cnt FROM articles WHERE published_at >= ? GROUP BY source, category ORDER BY cnt DESC LIMIT 60`).bind(cutoff).all(),
    env.DB.prepare(`SELECT t.name, COUNT(*) as cnt FROM tags t JOIN article_tags at ON t.id = at.tag_id JOIN articles a ON at.article_id = a.id WHERE a.published_at >= ? GROUP BY t.name ORDER BY cnt DESC LIMIT 20`).bind(cutoff).all(),
    env.DB.prepare(`SELECT CAST((strftime('%s','now') - strftime('%s', published_at)) / 3600 AS INTEGER) as hours_ago, CAST((strftime('%H', published_at, '+9 hours')) AS INTEGER) as jst_hour, COUNT(*) as cnt FROM articles WHERE published_at >= datetime('now','-24 hours') GROUP BY hours_ago ORDER BY hours_ago DESC`).all(),
    env.DB.prepare(`SELECT SUM(CASE WHEN importance_score >= 7 THEN 1 ELSE 0 END) as high, SUM(CASE WHEN importance_score >= 4 AND importance_score < 7 THEN 1 ELSE 0 END) as medium, SUM(CASE WHEN importance_score < 4 OR importance_score IS NULL THEN 1 ELSE 0 END) as low FROM articles WHERE published_at >= ?`).bind(cutoff).first(),
    env.DB.prepare("SELECT COUNT(*) as cnt FROM articles").first(),
  ]);

  const data = {
    hours,
    total:    (totalRow as { cnt: number } | null)?.cnt ?? 0,
    dbTotal:  (dbTotalRow as { cnt: number } | null)?.cnt ?? 0,
    byCategory:     (byCategoryRows.results  ?? []).map(r => r as { category: string; cnt: number }),
    bySource:       (bySourceRows.results    ?? []).map(r => r as { source: string; category: string; cnt: number }),
    trendingTags:   (trendingTagsRows.results ?? []).map(r => r as { name: string; cnt: number }),
    hourly:         (hourlyRows.results      ?? []).map(r => r as { hours_ago: number; jst_hour: number; cnt: number }),
    importanceDist: importanceDistRows as { high: number; medium: number; low: number } | null,
  };

  const response = NextResponse.json(data);
  response.headers.set("Cache-Control", `public, max-age=${CACHE_TTL}`);

  // Store in Cloudflare edge cache
  await cache.put(cacheKey, response.clone());

  return response;
}
