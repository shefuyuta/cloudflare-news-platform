// app/api/dashboard/route.ts
// All counts are scoped to the same time window as the news display.
// ?hours=N  (default 24) — matches the Header time-range selector.
import { NextResponse } from "next/server";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import type { Env } from "@/lib/types";

export async function GET(req: Request): Promise<Response> {
  const env = (await getCloudflareContext()).env as unknown as Env;
  const { searchParams } = new URL(req.url);
  const hours  = Math.max(1, parseInt(searchParams.get("hours") ?? "24", 10));
  const cutoff = new Date(Date.now() - hours * 3_600_000).toISOString();

  const [
    totalRow,
    byCategoryRows,
    bySourceRows,
    trendingTagsRows,
    hourlyRows,
    importanceDistRows,
    dbTotalRow,
  ] = await Promise.all([
    // Count within window
    env.DB.prepare(
      "SELECT COUNT(*) as cnt FROM articles WHERE published_at >= ?"
    ).bind(cutoff).first(),

    // Category breakdown within window
    env.DB.prepare(
      "SELECT category, COUNT(*) as cnt FROM articles WHERE published_at >= ? GROUP BY category ORDER BY cnt DESC"
    ).bind(cutoff).all(),

    // Source heatmap within window
    env.DB.prepare(
      `SELECT source, category, COUNT(*) as cnt
       FROM articles
       WHERE published_at >= ?
       GROUP BY source, category
       ORDER BY cnt DESC LIMIT 60`
    ).bind(cutoff).all(),

    // Trending tags within window
    env.DB.prepare(
      `SELECT t.name, COUNT(*) as cnt
       FROM tags t
       JOIN article_tags at ON t.id = at.tag_id
       JOIN articles a ON at.article_id = a.id
       WHERE a.published_at >= ?
       GROUP BY t.name
       ORDER BY cnt DESC LIMIT 20`
    ).bind(cutoff).all(),

    // Hourly volume — always last 24h regardless of window (shows recent rhythm)
    env.DB.prepare(
      `SELECT strftime('%H', published_at) as hour, COUNT(*) as cnt
       FROM articles
       WHERE published_at >= datetime('now','-24 hours')
       GROUP BY hour ORDER BY hour`
    ).all(),

    // Importance distribution within window
    env.DB.prepare(
      `SELECT
         SUM(CASE WHEN importance_score >= 7 THEN 1 ELSE 0 END) as high,
         SUM(CASE WHEN importance_score >= 4 AND importance_score < 7 THEN 1 ELSE 0 END) as medium,
         SUM(CASE WHEN importance_score < 4 OR importance_score IS NULL THEN 1 ELSE 0 END) as low
       FROM articles WHERE published_at >= ?`
    ).bind(cutoff).first(),

    // Total ever in DB (shown separately as "DB total" for housekeeping)
    env.DB.prepare("SELECT COUNT(*) as cnt FROM articles").first(),
  ]);

  return NextResponse.json({
    hours,                     // echo back so the UI can show "last Nh"
    total:    (totalRow as { cnt: number } | null)?.cnt ?? 0,
    dbTotal:  (dbTotalRow as { cnt: number } | null)?.cnt ?? 0,
    byCategory:      (byCategoryRows.results  ?? []).map(r => r as { category: string; cnt: number }),
    bySource:        (bySourceRows.results    ?? []).map(r => r as { source: string; category: string; cnt: number }),
    trendingTags:    (trendingTagsRows.results ?? []).map(r => r as { name: string; cnt: number }),
    hourly:          (hourlyRows.results      ?? []).map(r => r as { hour: string; cnt: number }),
    importanceDist:  importanceDistRows as { high: number; medium: number; low: number } | null,
  });
}
