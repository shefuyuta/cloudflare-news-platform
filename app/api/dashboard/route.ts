// app/api/dashboard/route.ts
// Dashboard statistics endpoint — called client-side from DashboardClient.
import { NextResponse } from "next/server";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import type { Env } from "@/lib/types";

export async function GET(): Promise<Response> {
  const env = (await getCloudflareContext()).env as unknown as Env;

  const [
    totalRow,
    byCategoryRows,
    bySourceRows,
    trendingTagsRows,
    hourlyRows,
    importanceDistRows,
  ] = await Promise.all([
    env.DB.prepare("SELECT COUNT(*) as cnt FROM articles").first(),
    env.DB.prepare(
      "SELECT category, COUNT(*) as cnt FROM articles GROUP BY category ORDER BY cnt DESC"
    ).all(),
    env.DB.prepare(
      `SELECT source, category, COUNT(*) as cnt
       FROM articles
       WHERE published_at >= datetime('now','-48 hours')
       GROUP BY source, category
       ORDER BY cnt DESC LIMIT 60`
    ).all(),
    env.DB.prepare(
      `SELECT t.name, COUNT(*) as cnt
       FROM tags t
       JOIN article_tags at ON t.id = at.tag_id
       JOIN articles a ON at.article_id = a.id
       WHERE a.published_at >= datetime('now','-24 hours')
       GROUP BY t.name
       ORDER BY cnt DESC LIMIT 20`
    ).all(),
    env.DB.prepare(
      `SELECT strftime('%H', published_at) as hour, COUNT(*) as cnt
       FROM articles
       WHERE published_at >= datetime('now','-24 hours')
       GROUP BY hour ORDER BY hour`
    ).all(),
    env.DB.prepare(
      `SELECT
         SUM(CASE WHEN importance_score >= 7 THEN 1 ELSE 0 END) as high,
         SUM(CASE WHEN importance_score >= 4 AND importance_score < 7 THEN 1 ELSE 0 END) as medium,
         SUM(CASE WHEN importance_score < 4 OR importance_score IS NULL THEN 1 ELSE 0 END) as low
       FROM articles
       WHERE published_at >= datetime('now','-24 hours')`
    ).first(),
  ]);

  return NextResponse.json({
    total: (totalRow as { cnt: number } | null)?.cnt ?? 0,
    byCategory: (byCategoryRows.results ?? []).map((r) => r as { category: string; cnt: number }),
    bySource: (bySourceRows.results ?? []).map((r) => r as { source: string; category: string; cnt: number }),
    trendingTags: (trendingTagsRows.results ?? []).map((r) => r as { name: string; cnt: number }),
    hourly: (hourlyRows.results ?? []).map((r) => r as { hour: string; cnt: number }),
    importanceDist: importanceDistRows as { high: number; medium: number; low: number } | null,
  });
}
