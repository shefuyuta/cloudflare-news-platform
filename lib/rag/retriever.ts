// lib/rag/retriever.ts
import type { Env, NewsArticle, Citation, ChatRequest } from "../types";
import type { RagConfig } from "./config";
import { embed } from "./embeddings";
import { getArticlesByIds } from "../db";

/**
 * Build a Vectorize metadata filter from the chat UI's current view.
 * Vectorize supports simple equality filters on indexed metadata fields
 * — we put category/region/subcategory on every vector at ingest time.
 */
function buildFilter(ctx: ChatRequest["context"]): Record<string, unknown> | undefined {
  if (!ctx) return undefined;
  const f: Record<string, unknown> = {};
  if (ctx.category)    f.category    = ctx.category;
  if (ctx.region)      f.region      = ctx.region;
  if (ctx.subcategory) f.subcategory = ctx.subcategory;
  return Object.keys(f).length ? f : undefined;
}

/** Retrieve the most relevant articles for `query` within the user's view. */
export async function retrieve(
  env: Env,
  query: string,
  ctx: ChatRequest["context"],
  cfg: RagConfig,
): Promise<{ article: NewsArticle; score: number; chunkText?: string }[]> {

  const vec = await embed(env, query, cfg);

  const search = await env.VECTORIZE.query(vec, {
    topK: cfg.topK,
    filter: buildFilter(ctx),
    returnValues: false,
    returnMetadata: "all",
  });

  // Score floor + dedupe by article_id (one article → many chunks; keep best)
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

  const rows = await getArticlesByIds(env, ids);
  return rows
    .map(article => {
      const hit = byArticle.get(article.id)!;
      return { article, score: hit.score, chunkText: hit.chunkText };
    })
    .sort((a, b) => b.score - a.score);
}

/** Convert retriever output → citation objects for the API response. */
export function toCitations(hits: { article: NewsArticle; score: number }[]): Citation[] {
  return hits.map(h => ({
    article_id: h.article.id,
    title:      h.article.title,
    url:        h.article.url,
    source:     h.article.source,
    score:      Math.round(h.score * 1000) / 1000,
  }));
}
