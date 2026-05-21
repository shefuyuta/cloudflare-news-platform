// app/api/scrape-content/route.ts
// Fetches full article body for articles not yet scraped.
// Called after embed-missing in the refresh pipeline.
// Processes up to BATCH_SIZE per call; safe to call repeatedly.
import { NextResponse } from "next/server";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { scrapeArticle } from "@/lib/rag/scraper";
import type { Env } from "@/lib/types";

const BATCH_SIZE  = 10;
const TIMEOUT_MS  = 25_000;
const MIN_CONTENT = 120;   // chars — discard very short results (paywalls etc)
const MAX_CONTENT = 4_000; // chars stored in the content column

export async function POST(): Promise<Response> {
  const start = Date.now();
  const env   = (await getCloudflareContext()).env as unknown as Env;

  const rows = await env.DB.prepare(`
    SELECT id, url
    FROM articles
    WHERE scraped_at IS NULL AND url IS NOT NULL
    ORDER BY published_at DESC
    LIMIT ?
  `).bind(BATCH_SIZE).all();

  const articles = (rows.results ?? []) as { id: string; url: string }[];

  let scraped = 0;
  let skipped = 0;

  for (const a of articles) {
    if (Date.now() - start > TIMEOUT_MS) break;

    const raw = await scrapeArticle(a.url);
    const now = new Date().toISOString();

    if (raw && raw.length >= MIN_CONTENT) {
      await env.DB.prepare(
        // Clear vector_id so embed-missing will re-embed using the richer content
        "UPDATE articles SET content = ?, scraped_at = ?, vector_id = NULL, embedded_at = NULL WHERE id = ?"
      ).bind(raw.slice(0, MAX_CONTENT), now, a.id).run();
      scraped++;
    } else {
      // Mark attempted so we don't retry blocked/paywalled sites every run
      await env.DB.prepare(
        "UPDATE articles SET scraped_at = ? WHERE id = ?"
      ).bind(now, a.id).run();
      skipped++;
    }
  }

  const remaining = (await env.DB.prepare(
    "SELECT COUNT(*) as cnt FROM articles WHERE scraped_at IS NULL"
  ).first() as { cnt: number } | null)?.cnt ?? 0;

  return NextResponse.json({
    processed: articles.length, scraped, skipped, remaining,
    elapsed: `${((Date.now() - start) / 1000).toFixed(1)}s`,
  });
}
