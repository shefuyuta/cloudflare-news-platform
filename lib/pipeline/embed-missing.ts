// lib/pipeline/embed-missing.ts
// ---------------------------------------------------------------------
// Core "embed articles missing from Vectorize" pipeline, callable
// directly with an `env`.
//
// Extracted from the API route (app/api/embed-missing/route.ts) so BOTH
// the browser route AND the cron scheduled handler (worker.ts) can run
// it. The cron previously self-fetched the HTTP route in a loop, but a
// scheduled handler cannot wait for a self-request to finish (the
// context closes first). Calling this function directly — looped until
// `remaining` reaches 0 — keeps everything in one Worker invocation.
//
// Processes in small batches to stay within Workers time limits; each
// call embeds up to MAX_PER_RUN articles, so the caller loops.
// ---------------------------------------------------------------------

import { loadRuntimeConfig } from "../rag/config";
import { embedBatch, chunk } from "../rag/embeddings";
import { loadSubcategoryRefs, classifyByEmbedding } from "../fetcher/subcategory-embed";
import { upsertTags, setArticleTags } from "../db";
import type { Env } from "../types";

const BATCH_TIMEOUT_MS = 25_000;
const MAX_PER_RUN = 200;      // articles per call (batched embedding is fast)
const EMBED_GROUP = 25;       // texts per single Workers AI embedding call
const DB_BATCH    = 50;       // statements per D1 batch()

export interface EmbedMissingResult {
  processed: number;
  embedded: number;
  errors: number;
  remaining: number;
  elapsed: string;
}

export async function runEmbedMissing(env: Env): Promise<EmbedMissingResult> {
  const startTime = Date.now();
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

  // ── Build the work list: one entry per article, with its text chunks ──
  // Most articles are a single chunk (title + short summary), so grouping
  // many articles into one Workers AI call embeds dozens at once instead
  // of paying the per-call latency for each article.
  interface Work {
    id: string;
    chunks: string[];
    category: string;
    region: string;
    subcategory: string;
  }
  const work: Work[] = [];
  for (const row of articles) {
    const r = row as Record<string, unknown>;
    const id = r.id as string;
    const title = (r.title as string) || "";
    const body  = cleanText((r.content as string) || (r.summary as string) || "");
    const text  = [title, body].filter(Boolean).join(". ").trim();
    if (!text) continue;
    const chunks = chunk(text);
    if (!chunks.length) continue;
    work.push({
      id,
      chunks,
      category: (r.category as string) || "general",
      region: (r.region as string) || "",
      subcategory: (r.subcategory as string) || "",
    });
  }

  // ── Flatten chunks across articles, remembering which chunk belongs to
  //    which article, so we can embed many articles per AI call. ──
  interface FlatChunk { workIdx: number; chunkIdx: number; text: string; }
  const flat: FlatChunk[] = [];
  work.forEach((w, wi) => w.chunks.forEach((c, ci) => flat.push({ workIdx: wi, chunkIdx: ci, text: c })));

  // Vectors per article, indexed [workIdx][chunkIdx].
  const vecByWork: number[][][] = work.map(w => new Array(w.chunks.length));

  for (let i = 0; i < flat.length; i += EMBED_GROUP) {
    if (Date.now() - startTime > BATCH_TIMEOUT_MS) break;
    const group = flat.slice(i, i + EMBED_GROUP);
    try {
      const vectors = await embedBatch(env, group.map(g => g.text), cfg);
      vectors.forEach((v, gi) => {
        const { workIdx, chunkIdx } = group[gi];
        vecByWork[workIdx][chunkIdx] = v;
      });
    } catch (e) {
      console.warn("[embed-missing] embed group failed", e);
      // Mark those articles as errored by leaving their vectors empty.
    }
  }

  // ── Batch the Vectorize upserts and the D1 vector_id updates. ──
  const vectorRecords: { id: string; values: number[]; metadata: Record<string, string> }[] = [];
  const dbUpdates = [];
  const refineList: { id: string; vec0: number[] }[] = [];
  const nowIso = new Date().toISOString();

  for (let wi = 0; wi < work.length; wi++) {
    const w = work[wi];
    const vecs = vecByWork[wi];
    // Require the first chunk's vector at minimum.
    if (!vecs[0] || !vecs[0].length) { errors++; continue; }

    vecs.forEach((values, ci) => {
      if (!values || !values.length) return;
      vectorRecords.push({
        id: `${w.id}#${ci}`,
        values,
        metadata: {
          article_id: w.id,
          category: w.category,
          region: w.region,
          subcategory: w.subcategory,
          text: w.chunks[ci].slice(0, 1500),
        },
      });
    });
    dbUpdates.push(
      env.DB.prepare("UPDATE articles SET vector_id = ?, embedded_at = ? WHERE id = ?")
            .bind(`${w.id}#0`, nowIso, w.id),
    );
    if (subRefs && w.category === "cybersecurity") refineList.push({ id: w.id, vec0: vecs[0] });
    embedded++;
  }

  // Upsert vectors to Vectorize in chunks (its upsert takes an array).
  for (let i = 0; i < vectorRecords.length; i += DB_BATCH) {
    try {
      await env.VECTORIZE.upsert(vectorRecords.slice(i, i + DB_BATCH));
    } catch (e) {
      console.warn("[embed-missing] vectorize upsert failed", e);
    }
  }

  // Batch the vector_id updates.
  for (let i = 0; i < dbUpdates.length; i += DB_BATCH) {
    try {
      await env.DB.batch(dbUpdates.slice(i, i + DB_BATCH));
    } catch (e) {
      console.warn("[embed-missing] vector_id update batch failed", e);
    }
  }

  // Refine subcategory tags for cyber articles (embedding similarity).
  for (const { id, vec0 } of refineList) {
    if (Date.now() - startTime > BATCH_TIMEOUT_MS) break;
    try {
      const labels = classifyByEmbedding(vec0, subRefs!, subThreshold);
      if (labels.length) await refineSubTags(env, id, labels);
    } catch (e) {
      console.warn(`[embed-missing] refine failed for ${id}:`, e);
    }
  }

  // Check remaining
  const remaining = await env.DB.prepare(
    "SELECT COUNT(*) as cnt FROM articles WHERE vector_id IS NULL"
  ).first() as { cnt: number } | null;

  return {
    processed: articles.length,
    embedded,
    errors,
    remaining: remaining?.cnt ?? 0,
    elapsed: `${((Date.now() - startTime) / 1000).toFixed(1)}s`,
  };
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

/**
 * Strip CSS/HTML/script noise from feed text before embedding.
 *
 * Several RSS sources (e.g. RedPacketSecurity) inject <style> blocks,
 * inline CSS rules, or HTML wrappers into the summary/content. Embedding
 * that noise produces vectors that represent the CSS, not the article —
 * which is why "ランサム" failed to match a "Ransomware Victim" article
 * whose summary was a block of CSS. This removes the common offenders and
 * collapses whitespace. Deliberately conservative: it strips markup and
 * CSS-rule syntax but keeps ordinary prose (including code-like terms in
 * real sentences).
 */
function cleanText(input: string): string {
  if (!input) return "";
  let s = input;

  // Remove <style>/<script> blocks entirely (including contents).
  s = s.replace(/<style[\s\S]*?<\/style>/gi, " ");
  s = s.replace(/<script[\s\S]*?<\/script>/gi, " ");

  // Remove HTML/XML comments and CSS block comments.
  s = s.replace(/<!--[\s\S]*?-->/g, " ");
  s = s.replace(/\/\*[\s\S]*?\*\//g, " ");

  // Remove CSS rule blocks: "selector { prop: value; ... }".
  // Runs until no brace-blocks remain (handles a few nested/stacked rules).
  for (let i = 0; i < 5 && /\{[^{}]*\}/.test(s); i++) {
    s = s.replace(/[^{}]*\{[^{}]*\}/g, " ");
  }

  // Strip any remaining HTML tags.
  s = s.replace(/<[^>]+>/g, " ");

  // Decode a few common HTML entities.
  s = s.replace(/&nbsp;/gi, " ")
       .replace(/&amp;/gi, "&")
       .replace(/&lt;/gi, "<")
       .replace(/&gt;/gi, ">")
       .replace(/&quot;/gi, '"')
       .replace(/&#39;/gi, "'");

  // Collapse whitespace.
  s = s.replace(/\s+/g, " ").trim();

  return s;
}
