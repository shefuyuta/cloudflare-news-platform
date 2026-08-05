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
import { loadSubcategoryRefs, classifyByEmbedding } from "@/lib/fetcher/subcategory-embed";
import { upsertTags, setArticleTags } from "@/lib/db";
import type { Env } from "@/lib/types";

const BATCH_TIMEOUT_MS = 25_000;
const MAX_PER_RUN = 30; // Process up to 30 articles per call

export async function POST(): Promise<Response> {
  const startTime = Date.now();
  const env = (await getCloudflareContext()).env as unknown as Env;
  const cfg = await loadRuntimeConfig(env);

  // Phase 2-A: if reference vectors are present, refine cyber articles'
  // sub:* tags by embedding similarity. Absent → keyword tags stand.
  const subRefs = await loadSubcategoryRefs(env);
  // Similarity threshold for subcategory assignment. Tune in rag_config
  // via key "subcategory_threshold" if needed; default 0.5.
  const subThreshold = await loadSubThreshold(env);

  // Fetch articles without embeddings.
  // Prefer articles that have scraped content (richer embeddings).
  const rows = await env.DB.prepare(`
    SELECT id, title, summary, content, category, region, subcategory
    FROM articles
    WHERE vector_id IS NULL AND (content IS NOT NULL OR summary IS NOT NULL OR title IS NOT NULL)
    ORDER BY
      CASE WHEN content IS NOT NULL THEN 0 ELSE 1 END,  -- scraped first
      published_at DESC
    LIMIT ?
  `).bind(MAX_PER_RUN).all();

  const articles = rows.results ?? [];
  let embedded = 0;
  let errors = 0;

  for (const row of articles) {
    if (Date.now() - startTime > BATCH_TIMEOUT_MS) break;

    const r = row as Record<string, unknown>;
    const id = r.id as string;
    // Priority: scraped full content > RSS summary > title
    const text = ((r.content as string) || (r.summary as string) || (r.title as string) || "").trim();
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

        // Phase 2-A: refine subcategory tags via embedding similarity.
        // Only for cyber articles, only when references are loaded, and
        // only when we have a usable article vector (first chunk).
        if (subRefs && (r.category as string) === "cybersecurity" && vectors[0]) {
          const labels = classifyByEmbedding(vectors[0], subRefs, subThreshold);
          if (labels.length) {
            await refineSubTags(env, id, labels);
          }
          // No label clears threshold → keep the keyword sub:* tags.
        }

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

/** Load the subcategory similarity threshold from rag_config (default 0.5). */
async function loadSubThreshold(env: Env): Promise<number> {
  try {
    const row = await env.DB.prepare(
      "SELECT value FROM rag_config WHERE key = 'subcategory_threshold'"
    ).first() as { value: string } | null;
    const n = row ? Number(row.value) : NaN;
    return Number.isFinite(n) ? n : 0.5;
  } catch {
    return 0.5;
  }
}

/**
 * Replace an article's sub:* tags with the embedding-derived set, while
 * preserving all other (content/cross-cut) tags. Ensures the sub:* tag
 * rows exist, then rebuilds the article's full tag links.
 */
async function refineSubTags(env: Env, articleId: string, labels: string[]): Promise<void> {
  // Current tag names for this article.
  const existing = await env.DB.prepare(`
    SELECT t.name AS name
    FROM article_tags at JOIN tags t ON at.tag_id = t.id
    WHERE at.article_id = ?
  `).bind(articleId).all();

  const currentNames = (existing.results ?? []).map(r => (r as { name: string }).name);
  const nonSub = currentNames.filter(n => !n.startsWith("sub:"));
  const newSub = labels.map(l => `sub:${l}`);

  const finalNames = [...new Set([...nonSub, ...newSub])];
  const tagIds = await upsertTags(env, finalNames);
  await setArticleTags(env, articleId, tagIds);
}
