// lib/db.ts
import type { NewsArticle, ArticleQuery, Env } from "./types";
import { IMPORTANT_THRESHOLD } from "./categories";

/* ---------- Row → NewsArticle ------------------------------------ */

function rowToArticle(row: Record<string, unknown>, tags: string[]): NewsArticle {
  return {
    id:              row.id    as string,
    title:           row.title as string,
    summary:         (row.summary ?? undefined) as string | undefined,
    content:         (row.content ?? undefined) as string | undefined,
    category:        row.category as NewsArticle["category"],
    subcategory:     (row.subcategory ?? undefined) as string | undefined,
    region:          (row.region      ?? undefined) as string | undefined,
    tags,
    source:          (row.source ?? "") as string,
    url:             (row.url    ?? "") as string,
    publishedAt:     (row.published_at ?? "") as string,
    importanceScore: (row.importance_score ?? undefined) as number | undefined,
  };
}

/* ---------- Tag fetching ----------------------------------------- */

/** Bulk-load tag names for a set of article IDs in batched queries. */
async function fetchTagsFor(env: Env, articleIds: string[]): Promise<Map<string, string[]>> {
  if (!articleIds.length) return new Map();
  const map = new Map<string, string[]>();

  // Batch into chunks of 80 to stay safely under D1's ~999 bind param limit
  const CHUNK = 80;
  for (let i = 0; i < articleIds.length; i += CHUNK) {
    const chunk = articleIds.slice(i, i + CHUNK);
    const placeholders = chunk.map(() => "?").join(",");
    const res = await env.DB.prepare(`
      SELECT at.article_id AS aid, t.name AS name
      FROM article_tags at
      JOIN tags t ON at.tag_id = t.id
      WHERE at.article_id IN (${placeholders})
    `).bind(...chunk).all();

    for (const r of res.results ?? []) {
      const aid  = (r as { aid: string }).aid;
      const name = (r as { name: string }).name;
      const arr  = map.get(aid) ?? [];
      arr.push(name);
      map.set(aid, arr);
    }
  }
  return map;
}

/* ---------- listArticles ----------------------------------------- */

/**
 * List articles with optional filters.
 *
 * Tag filtering is ANY-of: if the caller passes tags=[a,b], any article
 * having at least one of those tags matches. Returned `tags` always
 * contains the article's full tag list, not just the matched ones.
 */
export async function listArticles(env: Env, q: ArticleQuery = {}): Promise<NewsArticle[]> {
  const where:  string[] = [];
  const binds:  unknown[] = [];

  if (q.category)            { where.push("a.category    = ?"); binds.push(q.category); }
  if (q.region)              { where.push("a.region      = ?"); binds.push(q.region); }
  if (q.subcategory)         { where.push("a.subcategory = ?"); binds.push(q.subcategory); }
  if (q.source)              { where.push("a.source      = ?"); binds.push(q.source); }
  if (q.q)                   { where.push("(a.title LIKE ? OR a.summary LIKE ? OR a.content LIKE ?)"); binds.push(`%${q.q}%`, `%${q.q}%`, `%${q.q}%`); }
  if (q.important)           { where.push("a.importance_score >= ?"); binds.push(IMPORTANT_THRESHOLD); }
  if (q.minScore !== undefined) { where.push("a.importance_score >= ?"); binds.push(q.minScore); }
  if (q.maxScore !== undefined) { where.push("(a.importance_score <= ? OR a.importance_score IS NULL)"); binds.push(q.maxScore); }

  // Time range — skipped when noTimeLimit is set (used by /search)
  if (!q.noTimeLimit && q.hoursAgo && q.hoursAgo > 0) {
    const cutoff = new Date(Date.now() - q.hoursAgo * 3600_000).toISOString();
    where.push("a.published_at >= ?");
    binds.push(cutoff);
  }

  // tag ANY-of filter via EXISTS subquery — does not affect the SELECT shape
  if (q.tags?.length) {
    const ph = q.tags.map(() => "?").join(",");
    where.push(`EXISTS (
      SELECT 1 FROM article_tags at2
      JOIN tags t2 ON at2.tag_id = t2.id
      WHERE at2.article_id = a.id AND t2.name IN (${ph})
    )`);
    binds.push(...q.tags);
  }

  const sql = `
    SELECT a.id, a.title, a.summary, a.content,
           a.category, a.subcategory, a.region,
           a.source, a.url, a.importance_score, a.published_at
    FROM articles a
    ${where.length ? "WHERE " + where.join(" AND ") : ""}
    ORDER BY
      ${q.sortBy === "importance"
        ? "COALESCE(a.importance_score, 0) DESC, a.published_at DESC"
        : q.sortBy === "relevance" && q.q
          ? `CASE WHEN a.title LIKE '%${(q.q ?? "").replace(/'/g, "''")}%' THEN 0 ELSE 1 END, a.published_at DESC`
          : "a.published_at DESC"}
    LIMIT ? OFFSET ?
  `;
  binds.push(q.limit ?? 50, q.offset ?? 0);

  const rows = await env.DB.prepare(sql).bind(...binds).all();
  const ids  = (rows.results ?? []).map(r => (r as { id: string }).id);
  const tags = await fetchTagsFor(env, ids);

  return (rows.results ?? []).map(r =>
    rowToArticle(r as Record<string, unknown>, tags.get((r as { id: string }).id) ?? []),
  );
}

/* ---------- byIds (used by RAG to hydrate citations) -------------- */

export async function getArticlesByIds(env: Env, ids: string[]): Promise<NewsArticle[]> {
  if (!ids.length) return [];
  const ph = ids.map(() => "?").join(",");
  const rows = await env.DB.prepare(`
    SELECT id, title, summary, content, category, subcategory, region,
           source, url, importance_score, published_at
    FROM articles WHERE id IN (${ph})
  `).bind(...ids).all();
  const tagMap = await fetchTagsFor(env, ids);
  return (rows.results ?? []).map(r =>
    rowToArticle(r as Record<string, unknown>, tagMap.get((r as { id: string }).id) ?? []),
  );
}

/* ---------- Distinct tags (for the filter chip list) -------------- */

export async function listAllTags(env: Env, category?: string): Promise<string[]> {
  const sql = category
    ? `SELECT DISTINCT t.name FROM tags t
         JOIN article_tags at ON t.id = at.tag_id
         JOIN articles    a  ON at.article_id = a.id
         WHERE a.category = ?
         ORDER BY t.name`
    : `SELECT DISTINCT name FROM tags ORDER BY name`;
  const stmt = category ? env.DB.prepare(sql).bind(category) : env.DB.prepare(sql);
  const res  = await stmt.all();
  return (res.results ?? []).map(r => (r as { name: string }).name);
}

/* ---------- Tag upsert (used by ingest) --------------------------- */

/** Insert tag names if missing, return their ids in the same order. */
export async function upsertTags(env: Env, names: string[]): Promise<number[]> {
  if (!names.length) return [];
  const insertSql = "INSERT OR IGNORE INTO tags (name) VALUES " + names.map(() => "(?)").join(",");
  await env.DB.prepare(insertSql).bind(...names).run();

  const ph = names.map(() => "?").join(",");
  const res = await env.DB.prepare(
    `SELECT id, name FROM tags WHERE name IN (${ph})`,
  ).bind(...names).all();

  const map = new Map<string, number>();
  for (const r of res.results ?? []) {
    map.set((r as { name: string }).name, (r as { id: number }).id);
  }
  return names.map(n => map.get(n)!).filter(Boolean);
}

/** Replace an article's tag links with the given set of tag IDs. */
export async function setArticleTags(env: Env, articleId: string, tagIds: number[]) {
  await env.DB.prepare("DELETE FROM article_tags WHERE article_id = ?").bind(articleId).run();
  if (!tagIds.length) return;
  const vals = tagIds.map(() => "(?, ?)").join(",");
  const binds: unknown[] = [];
  for (const tid of tagIds) { binds.push(articleId, tid); }
  await env.DB.prepare(`INSERT OR IGNORE INTO article_tags (article_id, tag_id) VALUES ${vals}`)
              .bind(...binds).run();
}
