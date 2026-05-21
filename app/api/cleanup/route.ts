// app/api/cleanup/route.ts
// Deletes articles older than KEEP_HOURS from D1 and their vectors from Vectorize.
// Called by workers fetcher Cron, and also manually from the Dashboard.
import { NextResponse } from "next/server";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import type { Env } from "@/lib/types";

// Keep articles for the longest display window (1 week) plus a 1-day buffer.
const KEEP_HOURS = 24 * 8; // 8 days

export async function POST(): Promise<Response> {
  const env    = (await getCloudflareContext()).env as unknown as Env;
  const cutoff = new Date(Date.now() - KEEP_HOURS * 3_600_000).toISOString();

  let totalDeleted = 0;

  // Loop in batches until nothing left to delete (handles large backlogs)
  for (let round = 0; round < 20; round++) {
    const toDelete = await env.DB.prepare(
      "SELECT id FROM articles WHERE published_at < ? LIMIT 200"
    ).bind(cutoff).all();

    const ids = (toDelete.results ?? []).map(r => (r as { id: string }).id);
    if (!ids.length) break;

    // Delete from Vectorize
    try { await env.VECTORIZE.deleteByIds(ids); } catch {}

    const ph = ids.map(() => "?").join(",");

    // Delete orphaned article_tags first (no FK cascade in schema)
    await env.DB.prepare(
      `DELETE FROM article_tags WHERE article_id IN (${ph})`
    ).bind(...ids).run();

    // Delete articles
    const r = await env.DB.prepare(
      `DELETE FROM articles WHERE id IN (${ph})`
    ).bind(...ids).run();

    totalDeleted += r.meta?.changes ?? ids.length;
  }

  // Report remaining count
  const remaining = (await env.DB.prepare(
    "SELECT COUNT(*) as cnt FROM articles"
  ).first() as { cnt: number } | null)?.cnt ?? 0;

  console.log(`[cleanup] Deleted ${totalDeleted} articles (cutoff: ${cutoff}), ${remaining} remaining`);

  return NextResponse.json({ deleted: totalDeleted, cutoff, keepHours: KEEP_HOURS, remaining });
}
