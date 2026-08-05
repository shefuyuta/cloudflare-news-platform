// lib/search/semantic.ts
// ---------------------------------------------------------------------
// Phase 2-B: embedding-based semantic search.
//
// Reuses the SAME Vectorize + embeddings infrastructure the RAG chat
// retriever uses (lib/rag/retriever.ts), but shaped for the search page:
//   - Returns NewsArticle[] in the same order/shape listArticles gives,
//     so the SearchPage/NewsList UI needs no changes.
//   - Query is embedded ONCE (no generation tokens consumed — this is a
//     vector similarity lookup, not an LLM call).
//   - Cross-lingual by construction: a Japanese query matches English
//     article vectors and vice-versa, because both live in the same
//     embedding space.
//
// This does NOT replace the LIKE search in lib/db.ts. The search page
// chooses: semantic when a free-text query is present, keyword LIKE as
// the deterministic fallback (and for exact-tag/source/category filters).
// ---------------------------------------------------------------------

import type { Env, NewsArticle } from "../types";
import type { RagConfig } from "../rag/config";
import { embed } from "../rag/embeddings";

export interface SemanticSearchOptions {
  /** Free-text query — required; this is what gets embedded. */
  query: string;
  /** Restrict to a primary category (Vectorize metadata filter). */
  category?: string;
  /** Restrict to a region (general desk). */
  region?: string;
  /** Restrict to a subcategory. Applied at the D1 hydration step via the
   *  multi-label sub:* tag, so an article that is both vuln and incident
   *  matches either. */
  subcategory?: string;
  /** Exact source filter, applied at the D1 hydration step. */
  source?: string;
  /** Tag ANY-of filter, applied at the D1 hydration step. */
  tags?: string[];
  /** Time window in hours; omit / set noTimeLimit for all-time. */
  hoursAgo?: number;
  noTimeLimit?: boolean;
  /** Max results to return after ranking. */
  limit?: number;
  /** Minimum cosine similarity to keep a match. Defaults to cfg.minScore. */
  minScore?: number;
}

/**
 * Run a semantic search and return hydrated NewsArticles ranked by
 * similarity. Empty array if nothing clears the score floor / filters.
 */
export async function semanticSearch(
  env: Env,
  cfg: RagConfig,
  opts: SemanticSearchOptions,
): Promise<NewsArticle[]> {
  const query = opts.query.trim();
  if (!query) return [];

  const limit    = opts.limit ?? 50;
  const minScore = opts.minScore ?? cfg.minScore;

  // 1. Embed the query (single vector; no LLM generation).
  const vec = await embed(env, query, cfg);

  // 2. Vectorize metadata filter (category/region only). Subcategory is
  //    multi-label via sub:* tags, so filtering it here against the single
  //    metadata value would miss secondary labels — we apply it at the D1
  //    hydration step instead (see hydrate()).
  const filter: Record<string, string> = {};
  if (opts.category)    filter.category    = opts.category;
  if (opts.region)      filter.region      = opts.region;

  // 3. Query Vectorize. Over-fetch so we still have enough after the
  //    D1-side time/source/tag filtering drops some candidates.
  //    NOTE: with returnMetadata:"all", Vectorize caps topK at 50 (error
  //    40025 if exceeded). We need the full metadata (article_id, text),
  //    so we cap at 50 rather than switching to returnMetadata:"indexed".
  const search = await env.VECTORIZE.query(vec, {
    topK: Math.min(Math.max(limit * 4, 20), 50),
    filter: Object.keys(filter).length ? filter : undefined,
    returnValues: false,
    returnMetadata: "all",
  });

  // 4. Dedupe chunk hits → best score per article_id.
  const byArticle = new Map<string, number>();
  for (const m of search.matches ?? []) {
    if (m.score < minScore) continue;
    const meta = (m.metadata ?? {}) as Record<string, unknown>;
    const articleId = (meta.article_id as string) ?? m.id;
    const prev = byArticle.get(articleId);
    if (prev === undefined || prev < m.score) byArticle.set(articleId, m.score);
  }

  const ids = [...byArticle.keys()];
  if (!ids.length) return [];

  // 5. Hydrate from D1 with the remaining filters (time/source/tags).
  //    Batched IN() to respect D1's bind-parameter limit.
  const rows = await hydrate(env, ids, opts);
  if (!rows.length) return [];

  // 6. Attach scores + sort by similarity, trim to limit.
  return rows
    .map(a => ({ a, score: byArticle.get(a.id) ?? 0 }))
    .sort((x, y) => y.score - x.score)
    .slice(0, limit)
    .map(x => x.a);
}

/**
 * Load article rows for the matched IDs, applying the D1-side filters
 * (published_at window, source, tag ANY-of). Returns NewsArticle[] with
 * tags populated. Order here is not final — the caller re-sorts by score.
 */
async function hydrate(
  env: Env,
  ids: string[],
  opts: SemanticSearchOptions,
): Promise<NewsArticle[]> {
  const CHUNK = 80; // stay under D1's ~999 bind-param ceiling
  const out: NewsArticle[] = [];

  // Time window
  const useTime = !opts.noTimeLimit && opts.hoursAgo && opts.hoursAgo > 0;
  const cutoff  = useTime
    ? new Date(Date.now() - (opts.hoursAgo as number) * 3_600_000).toISOString()
    : null;

  for (let i = 0; i < ids.length; i += CHUNK) {
    const chunkIds = ids.slice(i, i + CHUNK);
    const where: string[] = [`a.id IN (${chunkIds.map(() => "?").join(",")})`];
    const binds: unknown[] = [...chunkIds];

    if (cutoff)       { where.push("a.published_at >= ?"); binds.push(cutoff); }
    if (opts.source)  { where.push("a.source = ?");        binds.push(opts.source); }
    if (opts.subcategory) {
      where.push(`EXISTS (
        SELECT 1 FROM article_tags ats JOIN tags ts ON ats.tag_id = ts.id
        WHERE ats.article_id = a.id AND ts.name = ?
      )`);
      binds.push(`sub:${opts.subcategory}`);
    }
    if (opts.tags?.length) {
      const ph = opts.tags.map(() => "?").join(",");
      where.push(`EXISTS (
        SELECT 1 FROM article_tags at2 JOIN tags t2 ON at2.tag_id = t2.id
        WHERE at2.article_id = a.id AND t2.name IN (${ph})
      )`);
      binds.push(...opts.tags);
    }

    const res = await env.DB.prepare(`
      SELECT a.id, a.title, a.summary, a.content,
             a.category, a.subcategory, a.region,
             a.source, a.url, a.published_at
      FROM articles a
      WHERE ${where.join(" AND ")}
    `).bind(...binds).all();

    for (const r of res.results ?? []) {
      const row = r as Record<string, unknown>;
      out.push({
        id:          row.id as string,
        title:       row.title as string,
        summary:     (row.summary ?? undefined) as string | undefined,
        content:     (row.content ?? undefined) as string | undefined,
        category:    row.category as NewsArticle["category"],
        subcategory: (row.subcategory ?? undefined) as string | undefined,
        region:      (row.region ?? undefined) as string | undefined,
        tags:        [],
        source:      (row.source ?? "") as string,
        url:         (row.url ?? "") as string,
        publishedAt: (row.published_at ?? "") as string,
      });
    }
  }

  // Populate tags in one batched pass.
  await attachTags(env, out);
  return out;
}

/** Bulk-load tag names for the given articles (batched). Mutates in place. */
async function attachTags(env: Env, articles: NewsArticle[]): Promise<void> {
  const ids = articles.map(a => a.id);
  if (!ids.length) return;
  const map = new Map<string, string[]>();

  const CHUNK = 80;
  for (let i = 0; i < ids.length; i += CHUNK) {
    const chunkIds = ids.slice(i, i + CHUNK);
    const ph = chunkIds.map(() => "?").join(",");
    const res = await env.DB.prepare(`
      SELECT at.article_id AS aid, t.name AS name
      FROM article_tags at JOIN tags t ON at.tag_id = t.id
      WHERE at.article_id IN (${ph})
    `).bind(...chunkIds).all();
    for (const r of res.results ?? []) {
      const aid  = (r as { aid: string }).aid;
      const name = (r as { name: string }).name;
      const arr  = map.get(aid) ?? [];
      arr.push(name);
      map.set(aid, arr);
    }
  }

  for (const a of articles) a.tags = map.get(a.id) ?? [];
}
