// lib/rag/retriever.ts
import type { Env, NewsArticle, Citation, ChatRequest } from "../types";
import type { RagConfig } from "./config";
import { embed } from "./embeddings";

/**
 * Build a Vectorize metadata filter from the chat UI's current view.
 * Only category/region/subcategory are supported as Vectorize metadata filters.
 */
function buildFilter(ctx: ChatRequest["context"]): Record<string, string> | undefined {
  if (!ctx) return undefined;
  const f: Record<string, string> = {};
  if (ctx.category)    f.category    = ctx.category;
  if (ctx.region)      f.region      = ctx.region;
  if (ctx.subcategory) f.subcategory = ctx.subcategory;
  return Object.keys(f).length ? f : undefined;
}

/** Retrieve the most relevant articles for `query` within the user's current view window. */
export async function retrieve(
  env: Env,
  query: string,
  ctx: ChatRequest["context"],
  cfg: RagConfig,
): Promise<{ article: NewsArticle; score: number; chunkText?: string }[]> {

  const vec = await embed(env, query, cfg);

  // Over-fetch well beyond topK so enough survive the score floor + date
  // filter + dedupe. Cap at 50: with returnMetadata:"all", Vectorize rejects
  // topK > 50 (err 40025). (Was topK*3 ≈ 18, which under-fetched and, combined
  // with a tight time window, left the chat retriever returning 0 results.)
  const search = await env.VECTORIZE.query(vec, {
    topK: Math.min(Math.max(cfg.topK * 6, 30), 50),
    filter: buildFilter(ctx),
    returnValues: false,
    returnMetadata: "all",
  });

  // Score floor + dedupe by article_id
  const byArticle = new Map<string, { score: number; chunkText?: string }>();
  for (const m of search.matches ?? []) {
    if (m.score < cfg.minScore) continue;
    const meta = (m.metadata ?? {}) as Record<string, unknown>;
    const articleId = (meta.article_id as string) ?? m.id;
    const existing = byArticle.get(articleId);
    if (!existing || existing.score < m.score) {
      byArticle.set(articleId, {
        score: m.score,
        chunkText: (meta.text as string | undefined) ?? undefined,
      });
    }
  }

  const ids = [...byArticle.keys()];
  if (!ids.length) return [];

  // ── D1 fetch, optionally with a published_at filter ──────────────────
  // The chat retriever answers knowledge questions ("about Qilin", "last
  // week's attacks"), so by default it searches ALL history — a 24h gate
  // made it return nothing whenever no matching article was that recent.
  // A caller can still pass a window via ctx.hoursAgo (with noTimeLimit
  // unset) to scope results to the current view.
  const noTimeLimit = ctx?.noTimeLimit ?? true;   // chat defaults to all-time
  const useTime = !noTimeLimit && !!ctx?.hoursAgo && ctx.hoursAgo > 0;
  const cutoff  = useTime
    ? new Date(Date.now() - (ctx!.hoursAgo as number) * 3_600_000).toISOString()
    : "";

  const ph   = ids.map(() => "?").join(",");
  const rows = await env.DB.prepare(`
    SELECT id, title, summary, content, category, subcategory, region,
           source, url, published_at
    FROM articles
    WHERE id IN (${ph})
      ${useTime ? "AND published_at >= ?" : ""}
    ORDER BY published_at DESC
  `).bind(...(useTime ? [...ids, cutoff] : ids)).all();

  if (!rows.results?.length) return [];

  // Fetch tags for matched articles
  const matchedIds = (rows.results as { id: string }[]).map(r => r.id);
  const tagPh      = matchedIds.map(() => "?").join(",");
  const tagRows    = await env.DB.prepare(`
    SELECT at.article_id, t.name
    FROM article_tags at JOIN tags t ON at.tag_id = t.id
    WHERE at.article_id IN (${tagPh})
  `).bind(...matchedIds).all();

  const tagMap = new Map<string, string[]>();
  for (const tr of tagRows.results ?? []) {
    const row = tr as { article_id: string; name: string };
    const arr = tagMap.get(row.article_id) ?? [];
    arr.push(row.name);
    tagMap.set(row.article_id, arr);
  }

  const articles: NewsArticle[] = (rows.results as Record<string, unknown>[]).map(r => ({
    id:              r.id as string,
    title:           r.title as string,
    summary:         r.summary as string | undefined,
    content:         r.content as string | undefined,
    category:        r.category as NewsArticle["category"],
    subcategory:     r.subcategory as string | undefined,
    region:          r.region as string | undefined,
    source:          r.source as string,
    url:             r.url as string,
    publishedAt:     r.published_at as string,
    tags:            tagMap.get(r.id as string) ?? [],
  }));

  return articles
    .map(article => ({
      article,
      score:     byArticle.get(article.id)!.score,
      chunkText: byArticle.get(article.id)!.chunkText,
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, cfg.topK);   // trim back to topK after filtering
}

/** Convert retriever output → citation objects */
export function toCitations(hits: { article: NewsArticle; score: number }[]): Citation[] {
  return hits.map(h => ({
    article_id: h.article.id,
    title:      h.article.title,
    url:        h.article.url,
    source:     h.article.source,
    score:      Math.round(h.score * 1000) / 1000,
  }));
}
