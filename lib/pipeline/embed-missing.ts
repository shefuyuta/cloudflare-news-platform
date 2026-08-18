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
import { loadTechniqueRefs, classifyTechnique } from "../fetcher/technique-embed";
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
  const techRefs = await loadTechniqueRefs(env);
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
  const techniqueRefineList: { id: string; vec0: number[] }[] = [];
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
    // Technique classification is scoped to ai/cybersecurity articles (not
    // just the exact AI×Security intersection, which would need a tag JOIN
    // this pipeline doesn't otherwise do) — off-topic articles naturally
    // fall below the similarity threshold and get no technique tag, same
    // self-selecting behavior as vulnerability/incident classification.
    if (techRefs && (w.category === "cybersecurity" || w.category === "ai")) {
      techniqueRefineList.push({ id: w.id, vec0: vecs[0] });
    }
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

  // Classify AI attack techniques (embedding similarity), scoped to
  // ai/cybersecurity articles. Off-topic articles naturally score below
  // the threshold and get no tech:* tag.
  for (const { id, vec0 } of techniqueRefineList) {
    if (Date.now() - startTime > BATCH_TIMEOUT_MS) break;
    try {
      // Reuses the same threshold as subcategory classification (both
      // default via rag_config) — fine to split into its own config key
      // later if technique classification needs a different cutoff.
      const labels = classifyTechnique(vec0, techRefs!, subThreshold);
      if (labels.length) await refineTechniqueTags(env, id, labels);
    } catch (e) {
      console.warn(`[embed-missing] technique classification failed for ${id}:`, e);
    }
  }

  // Related-article (duplicate/same-story) detection: for each newly
  // embedded article, search Vectorize for similar articles and record the
  // ones that are recent + high-scoring. One row per (new article, older
  // match) pair; the UI joins both directions so either side shows the link.
  //
  // HARD CAP: this loop adds ONE extra Vectorize query (+ a D1 lookup) per
  // article on top of embed-missing's normal ~17 subrequests/round. Running
  // it over the full `work` array (up to ~200/round x up to 8 rounds) blew
  // through the ~1000-subrequest budget and crashed the whole cron
  // invocation ("Exceeded Resources" on every scheduled job, not just this
  // one, since Workers kills the invocation outright when it hits the
  // limit). Capping to a small slice per pass keeps this well within
  // budget; articles beyond the cap simply don't get related-article
  // detection that round (no retry tracking yet — acceptable trade-off:
  // a few articles missing a "+N more" badge is far better than the whole
  // site's cron jobs dying).
  const RELATED_DETECTION_CAP = 15;
  const relatedInserts: ReturnType<typeof env.DB.prepare>[] = [];
  for (let wi = 0; wi < Math.min(work.length, RELATED_DETECTION_CAP); wi++) {
    if (Date.now() - startTime > BATCH_TIMEOUT_MS) break;
    const w = work[wi];
    const vec0 = vecByWork[wi][0];
    if (!vec0 || !vec0.length) continue;
    try {
      const matches = await findRelatedArticles(env, w.id, vec0, w.category);
      for (const m of matches) {
        relatedInserts.push(
          env.DB.prepare(
            "INSERT OR IGNORE INTO related_articles (article_id, related_id, score) VALUES (?, ?, ?)"
          ).bind(w.id, m.id, m.score)
        );
      }
    } catch (e) {
      console.warn(`[embed-missing] related-article search failed for ${w.id}:`, e);
    }
  }
  for (let i = 0; i < relatedInserts.length; i += DB_BATCH) {
    try {
      await env.DB.batch(relatedInserts.slice(i, i + DB_BATCH));
    } catch (e) {
      console.warn("[embed-missing] related_articles insert batch failed", e);
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

/**
 * Search Vectorize for articles similar to a just-embedded one, restricted
 * to the same category and to articles published within the last 72
 * hours (checked against D1, since Vectorize's metadata filter doesn't
 * carry publish time) — this is meant to catch different sources covering
 * the SAME recent story, not a topically-similar article from months ago.
 * Score threshold 0.85 is deliberately high (vs. the RAG chat's 0.35): the
 * chat wants "relevant", this wants "almost certainly the same event".
 */
const RELATED_SCORE_THRESHOLD = 0.85;
const RELATED_WINDOW_HOURS = 72;

async function findRelatedArticles(
  env: Env, articleId: string, vec0: number[], category: string,
): Promise<{ id: string; score: number }[]> {
  const search = await env.VECTORIZE.query(vec0, {
    topK: 6,
    filter: { category },
    returnValues: false,
    returnMetadata: "none",
  });

  const candidates = (search.matches ?? [])
    .filter(m => m.score >= RELATED_SCORE_THRESHOLD)
    .map(m => ({ id: (m.id as string).split("#")[0], score: m.score }))
    .filter(m => m.id !== articleId);
  if (!candidates.length) return [];

  // Dedupe (a match can appear via multiple chunks) and keep the best score.
  const bestById = new Map<string, number>();
  for (const c of candidates) bestById.set(c.id, Math.max(bestById.get(c.id) ?? 0, c.score));

  const ids = [...bestById.keys()];
  const ph  = ids.map(() => "?").join(",");
  const cutoff = new Date(Date.now() - RELATED_WINDOW_HOURS * 3_600_000).toISOString();
  const rows = await env.DB.prepare(
    `SELECT id FROM articles WHERE id IN (${ph}) AND published_at >= ?`
  ).bind(...ids, cutoff).all();
  const recentIds = new Set((rows.results ?? []).map(r => (r as { id: string }).id));

  return ids.filter(id => recentIds.has(id)).map(id => ({ id, score: bestById.get(id)! }));
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

/** Same pattern as refineSubTags, for the AI attack-technique labels
 *  (tech:* prefix) instead of sub:* — kept as a separate function since
 *  the two tag namespaces are unrelated and this makes each easy to
 *  reason about independently. */
async function refineTechniqueTags(env: Env, articleId: string, labels: string[]): Promise<void> {
  const existing = await env.DB.prepare(`
    SELECT t.name AS name
    FROM article_tags at JOIN tags t ON at.tag_id = t.id
    WHERE at.article_id = ?
  `).bind(articleId).all();

  const currentNames = (existing.results ?? []).map(r => (r as { name: string }).name);
  const nonTech = currentNames.filter(n => !n.startsWith("tech:"));
  const newTech = labels.map(l => `tech:${l}`);

  const finalNames = [...new Set([...nonTech, ...newTech])];
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
