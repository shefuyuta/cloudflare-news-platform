// app/api/scrape-content/route.ts
// Fetches full article body. Only triggers re-embedding if content changed.
import { NextResponse } from "next/server";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { scrapeArticle } from "@/lib/rag/scraper";
import type { Env } from "@/lib/types";

const BATCH_SIZE  = 10;
const TIMEOUT_MS  = 25_000;
const MIN_CONTENT = 120;
const MAX_CONTENT = 4_000;

/** Simple hash for change detection — avoids re-embedding identical content */
function simpleHash(s: string): string {
  let h = 0;
  for (let i = 0; i < Math.min(s.length, 500); i++) {
    h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  }
  return h.toString(16);
}

export async function POST(): Promise<Response> {
  const start = Date.now();
  const env   = (await getCloudflareContext()).env as unknown as Env;

  const rows = await env.DB.prepare(`
    SELECT id, url, content
    FROM articles
    WHERE scraped_at IS NULL AND url IS NOT NULL
    ORDER BY published_at DESC
    LIMIT ?
  `).bind(BATCH_SIZE).all();

  const articles = (rows.results ?? []) as { id: string; url: string; content?: string }[];

  let scraped   = 0;
  let skipped   = 0;
  let unchanged = 0;

  for (const a of articles) {
    if (Date.now() - start > TIMEOUT_MS) break;

    const raw = await scrapeArticle(a.url);
    const now = new Date().toISOString();

    if (raw && raw.length >= MIN_CONTENT) {
      const newContent = raw.slice(0, MAX_CONTENT);
      const oldHash    = a.content ? simpleHash(a.content) : null;
      const newHash    = simpleHash(newContent);
      const changed    = oldHash !== newHash;

      await env.DB.prepare(
        // Only clear vector_id (trigger re-embedding) if content actually changed
        changed
          ? "UPDATE articles SET content = ?, scraped_at = ?, vector_id = NULL, embedded_at = NULL WHERE id = ?"
          : "UPDATE articles SET content = ?, scraped_at = ? WHERE id = ?"
      ).bind(newContent, now, a.id).run();

      if (changed) scraped++;
      else unchanged++;
    } else {
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
    processed: articles.length, scraped, skipped, unchanged, remaining,
    elapsed: `${((Date.now() - start) / 1000).toFixed(1)}s`,
  });
}
