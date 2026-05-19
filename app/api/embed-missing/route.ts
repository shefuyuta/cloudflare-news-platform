// app/api/embed-missing/route.ts
// ---------------------------------------------------------------------
// Embed articles that are in D1 but not yet in Vectorize.
// Called separately from fetch-news to avoid timeout issues.
// Processes in small batches to stay within Workers time limits.
// ---------------------------------------------------------------------

import { NextResponse } from "next/server";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { loadRuntimeConfig } from "@/lib/rag/config";
import { embedBatch, chunk } from "@/lib/rag/embeddings";
import type { Env } from "@/lib/types";

const BATCH_TIMEOUT_MS = 25_000;
const MAX_PER_RUN = 30; // Process up to 30 articles per call

export async function POST(): Promise<Response> {
  const startTime = Date.now();
  const env = (await getCloudflareContext()).env as unknown as Env;
  const cfg = await loadRuntimeConfig(env);

  // Find articles without embeddings
  const rows = await env.DB.prepare(`
    SELECT id, title, summary, category, region, subcategory
    FROM articles
    WHERE vector_id IS NULL AND (summary IS NOT NULL OR title IS NOT NULL)
    ORDER BY published_at DESC
    LIMIT ?
  `).bind(MAX_PER_RUN).all();

  const articles = rows.results ?? [];
  let embedded = 0;
  let errors = 0;

  for (const row of articles) {
    if (Date.now() - startTime > BATCH_TIMEOUT_MS) break;

    const r = row as Record<string, unknown>;
    const id = r.id as string;
    const text = ((r.summary as string) || (r.title as string) || "").trim();
    if (!text) continue;

    try {
      const chunks = chunk(text);
      const vectors = await embedBatch(env, chunks, cfg);

      if (vectors.length) {
        await env.VECTORIZE.upsert(vectors.map((values, i) => ({
          id: `${id}#${i}`,
          values,
          metadata: {
            article_id: id,
            category: (r.category as string) || "general",
            region: (r.region as string) || "",
            subcategory: (r.subcategory as string) || "",
            text: chunks[i].slice(0, 1500),
          },
        })));

        await env.DB.prepare(
          "UPDATE articles SET vector_id = ?, embedded_at = ? WHERE id = ?"
        ).bind(`${id}#0`, new Date().toISOString(), id).run();

        embedded++;
      }
    } catch (e) {
      console.warn(`[embed-missing] Failed for ${id}:`, e);
      errors++;
    }
  }

  // Check remaining
  const remaining = await env.DB.prepare(
    "SELECT COUNT(*) as cnt FROM articles WHERE vector_id IS NULL"
  ).first() as { cnt: number } | null;

  return NextResponse.json({
    processed: articles.length,
    embedded,
    errors,
    remaining: remaining?.cnt ?? 0,
    elapsed: `${((Date.now() - startTime) / 1000).toFixed(1)}s`,
  });
}
