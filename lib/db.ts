// lib/db.ts
import type { NewsArticle, ArticleQuery, Env } from "./types";

/* ---------- Row → NewsArticle ------------------------------------ */

function rowToArticle(row: Record<string, unknown>, tags: string[], relatedCount = 0): NewsArticle {
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
    relatedCount,
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

/** Bulk-load related-article counts for a set of article IDs (bidirectional:
 *  counts both rows where this article is the newer trigger AND rows where
 *  it's the older match, since related_articles is stored one-directionally). */
async function fetchRelatedCountsFor(env: Env, articleIds: string[]): Promise<Map<string, number>> {
  if (!articleIds.length) return new Map();
  const map = new Map<string, number>();

  // Smaller chunk than fetchTagsFor's 80: this query binds the SAME chunk
  // TWICE (article_id IN (...) UNION ALL related_id IN (...)), so the
  // bind-param count is 2x the chunk size. Production hit "too many SQL
  // variables" at 80 (offset 410), so this drops to 30 for real headroom
  // rather than chasing the exact ceiling.
  const CHUNK = 30;
  for (let i = 0; i < articleIds.length; i += CHUNK) {
    const chunk = articleIds.slice(i, i + CHUNK);
    const placeholders = chunk.map(() => "?").join(",");
    const res = await env.DB.prepare(`
      SELECT id, COUNT(*) AS cnt FROM (
        SELECT article_id AS id FROM related_articles WHERE article_id IN (${placeholders})
        UNION ALL
        SELECT related_id AS id FROM related_articles WHERE related_id IN (${placeholders})
      )
      GROUP BY id
    `).bind(...chunk, ...chunk).all();

    for (const r of res.results ?? []) {
      const row = r as { id: string; cnt: number };
      map.set(row.id, Number(row.cnt));
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
/**
 * Builds the WHERE clause + bind params shared by listArticles and
 * countArticles, so the two can never drift out of sync (a common bug
 * source: filtering logic duplicated in two places that quietly diverge).
 * Does NOT include LIMIT/OFFSET/ORDER BY — those are query-shape specific.
 */
function buildArticleWhere(q: ArticleQuery): { where: string[]; binds: unknown[] } {
  const where:  string[] = [];
  const binds:  unknown[] = [];

  // Category filter. When crossLabel is set (e.g. "AI" for the /ai desk,
  // "Cyber" for /cybersecurity), an article matches if it is EITHER the
  // primary category OR carries the cross-cut tag — this is what makes a
  // story appear on both desks (multi-label, design "X + A").
  // AI × Security intersection, takes priority over category/crossLabel:
  // an article's cross-cut tag is only recorded for the desk OTHER than
  // its primary category (see classifier.ts), so an ai-category article
  // carries a "Cyber" tag (not "AI"), and a cybersecurity-category article
  // carries an "AI" tag (not "Cyber"). There's no single tag combination
  // that captures "belongs to both desks" — it has to be expressed as
  // this OR of two (category + tag) pairs.
  if (q.aiSecurityOnly) {
    where.push(`(
      (a.category = 'ai' AND EXISTS (
        SELECT 1 FROM article_tags atx JOIN tags tx ON atx.tag_id = tx.id
        WHERE atx.article_id = a.id AND tx.name = 'Cyber'
      ))
      OR
      (a.category = 'cybersecurity' AND EXISTS (
        SELECT 1 FROM article_tags aty JOIN tags ty ON aty.tag_id = ty.id
        WHERE aty.article_id = a.id AND ty.name = 'AI'
      ))
    )`);
  } else if (q.category) {
    if (q.crossLabel) {
      where.push(`(a.category = ? OR EXISTS (
        SELECT 1 FROM article_tags atc JOIN tags tc ON atc.tag_id = tc.id
        WHERE atc.article_id = a.id AND tc.name = ?
      ))`);
      binds.push(q.category, q.crossLabel);
    } else {
      where.push("a.category = ?");
      binds.push(q.category);
    }
  }
  if (q.region)              { where.push("a.region      = ?"); binds.push(q.region); }
  // Subcategory is multi-label: match against the sub:* tag rather than
  // the single `subcategory` column, so an article that is both a
  // vulnerability and an incident shows on either tab.
  // "other" is NOT a real tag — the classifier only ever produces
  // sub:vulnerability or sub:incident (see SUBCATEGORY_LABELS), and leaves
  // an article with NEITHER when neither clears the similarity threshold.
  // So "other" means "has neither sub:* tag", not "has a tag named other" —
  // matching on a literal sub:other tag (which is never created) silently
  // returned zero results for that tab.
  if (q.subcategory === "other") {
    where.push(`NOT EXISTS (
      SELECT 1 FROM article_tags ato JOIN tags to2 ON ato.tag_id = to2.id
      WHERE ato.article_id = a.id AND to2.name IN ('sub:vulnerability', 'sub:incident')
    )`);
  } else if (q.subcategory) {
    where.push(`EXISTS (
      SELECT 1 FROM article_tags ats JOIN tags ts ON ats.tag_id = ts.id
      WHERE ats.article_id = a.id AND ts.name = ?
    )`);
    binds.push(`sub:${q.subcategory}`);
  }
  if (q.source)              { where.push("a.source      = ?"); binds.push(q.source); }
  if (q.q)                   { where.push("(a.title LIKE ? OR a.summary LIKE ? OR a.content LIKE ?)"); binds.push(`%${q.q}%`, `%${q.q}%`, `%${q.q}%`); }

  // Time range — skipped when noTimeLimit is set (used by /search)
  if (!q.noTimeLimit && q.hoursAgo && q.hoursAgo > 0) {
    const cutoff = new Date(Date.now() - q.hoursAgo * 3600_000).toISOString();
    where.push("a.published_at >= ?");
    binds.push(cutoff);
  }

  // tag ALL-of filter: one EXISTS per selected tag, ANDed together, so an
  // article must have every selected tag (not just at least one). Was
  // previously a single EXISTS with `t2.name IN (...)` (OR/any-of) — that
  // meant adding more tag filters only ever widened results, which read as
  // "add a filter, get MORE articles" and confused the person filtering.
  if (q.tags?.length) {
    for (const tag of q.tags) {
      where.push(`EXISTS (
        SELECT 1 FROM article_tags at2
        JOIN tags t2 ON at2.tag_id = t2.id
        WHERE at2.article_id = a.id AND t2.name = ?
      )`);
      binds.push(tag);
    }
  }

  return { where, binds };
}

/**
 * Total count of articles matching the same filters as listArticles, for
 * server-side pagination (total page count). Deliberately shares
 * buildArticleWhere so the count and the actual results can never
 * disagree about what "matches the filters" means.
 */
export async function countArticles(env: Env, q: ArticleQuery = {}): Promise<number> {
  const { where, binds } = buildArticleWhere(q);
  const sql = `SELECT COUNT(*) AS cnt FROM articles a ${where.length ? "WHERE " + where.join(" AND ") : ""}`;
  const row = await env.DB.prepare(sql).bind(...binds).first() as { cnt: number } | null;
  return row?.cnt ?? 0;
}

export async function listArticles(env: Env, q: ArticleQuery = {}): Promise<NewsArticle[]> {
  const { where, binds } = buildArticleWhere(q);

  const sql = `
    SELECT a.id, a.title, a.summary, a.content,
           a.category, a.subcategory, a.region,
           a.source, a.url, a.published_at
    FROM articles a
    ${where.length ? "WHERE " + where.join(" AND ") : ""}
    ORDER BY
      ${q.sortBy === "relevance" && q.q
        ? `CASE WHEN a.title LIKE '%${(q.q ?? "").replace(/'/g, "''")}%' THEN 0 ELSE 1 END, a.published_at DESC`
        : "a.published_at DESC"}
    LIMIT ? OFFSET ?
  `;
  binds.push(q.limit ?? 50, q.offset ?? 0);

  const rows = await env.DB.prepare(sql).bind(...binds).all();
  const ids  = (rows.results ?? []).map(r => (r as { id: string }).id);
  const tags = await fetchTagsFor(env, ids);
  const relatedCounts = await fetchRelatedCountsFor(env, ids);

  return (rows.results ?? []).map(r => {
    const id = (r as { id: string }).id;
    return rowToArticle(r as Record<string, unknown>, tags.get(id) ?? [], relatedCounts.get(id) ?? 0);
  });
}

/* ---------- byIds (used by RAG to hydrate citations) -------------- */

export async function getArticlesByIds(env: Env, ids: string[]): Promise<NewsArticle[]> {
  if (!ids.length) return [];
  const ph = ids.map(() => "?").join(",");
  const rows = await env.DB.prepare(`
    SELECT id, title, summary, content, category, subcategory, region,
           source, url, published_at
    FROM articles WHERE id IN (${ph})
  `).bind(...ids).all();
  const tagMap = await fetchTagsFor(env, ids);
  return (rows.results ?? []).map(r =>
    rowToArticle(r as Record<string, unknown>, tagMap.get((r as { id: string }).id) ?? []),
  );
}

/* ---------- Distinct tags (for the filter chip list) -------------- */

/** Control tags that drive multi-label routing but should never appear
 *  as user-facing filter chips or on cards: sub:* subcategory labels and
 *  the cross-desk labels ("AI"/"Cyber"). */
export function isControlTag(name: string): boolean {
  return name.startsWith("sub:") || name === "AI" || name === "Cyber";
}

/**
 * Compact volume breakdown for the homepage's "last N hours" summary card —
 * deliberately lighter than the Dashboard's full stats (no region, no
 * trend history): just category counts and a short top-sources list,
 * scoped to `hoursAgo`. Kept as its own function (rather than reusing
 * countArticles per category) since it's one query per breakdown, not N.
 */
export async function getVolumeSummary(env: Env, hoursAgo: number): Promise<{
  byCategory: { category: string; cnt: number }[];
  bySource: { source: string; cnt: number }[];
  total: number;
}> {
  const cutoff = new Date(Date.now() - hoursAgo * 3600_000).toISOString();
  const [catRows, sourceRows, totalRow] = await Promise.all([
    env.DB.prepare(`SELECT category, COUNT(*) AS cnt FROM articles WHERE published_at >= ? GROUP BY category ORDER BY cnt DESC`).bind(cutoff).all(),
    env.DB.prepare(`SELECT source, COUNT(*) AS cnt FROM articles WHERE published_at >= ? GROUP BY source ORDER BY cnt DESC LIMIT 6`).bind(cutoff).all(),
    env.DB.prepare(`SELECT COUNT(*) AS cnt FROM articles WHERE published_at >= ?`).bind(cutoff).first() as Promise<{ cnt: number } | null>,
  ]);
  return {
    byCategory: (catRows.results ?? []).map(r => r as { category: string; cnt: number }),
    bySource: (sourceRows.results ?? []).map(r => r as { source: string; cnt: number }),
    total: totalRow?.cnt ?? 0,
  };
}

/**
 * Distinct tags for a category, scoped to the SAME time window + region
 * the person is currently viewing (not all-time) — so counts reflect what
 * clicking that tag will actually show, and the list doesn't include tags
 * that have zero articles in view.
 */
export async function listAllTags(
  env: Env,
  category?: string,
  opts?: { hoursAgo?: number; region?: string; subcategory?: string; aiSecurityOnly?: boolean },
): Promise<{ name: string; count: number }[]> {
  const where: string[] = [];
  const binds: unknown[] = [];
  if (opts?.aiSecurityOnly) {
    // Same AI×Security intersection condition as listArticles — see the
    // comment there for why this can't be expressed as a simple tag match.
    where.push(`(
      (a.category = 'ai' AND EXISTS (
        SELECT 1 FROM article_tags atx JOIN tags tx ON atx.tag_id = tx.id
        WHERE atx.article_id = a.id AND tx.name = 'Cyber'
      ))
      OR
      (a.category = 'cybersecurity' AND EXISTS (
        SELECT 1 FROM article_tags aty JOIN tags ty ON aty.tag_id = ty.id
        WHERE aty.article_id = a.id AND ty.name = 'AI'
      ))
    )`);
  } else if (category) {
    where.push("a.category = ?"); binds.push(category);
  }
  if (opts?.hoursAgo && opts.hoursAgo > 0) {
    const cutoff = new Date(Date.now() - opts.hoursAgo * 3600_000).toISOString();
    where.push("a.published_at >= ?");
    binds.push(cutoff);
  }
  if (opts?.region) { where.push("a.region = ?"); binds.push(opts.region); }
  if (opts?.subcategory === "other") {
    // "other" = neither sub:vulnerability nor sub:incident (see the same
    // fix in listArticles above — sub:other is never a real tag).
    where.push(`NOT EXISTS (
      SELECT 1 FROM article_tags at3o JOIN tags t3o ON at3o.tag_id = t3o.id
      WHERE at3o.article_id = a.id AND t3o.name IN ('sub:vulnerability', 'sub:incident')
    )`);
  } else if (opts?.subcategory) {
    // Same convention as listArticles: subcategory is a sub:* TAG, not the
    // `subcategory` column (multi-label history — see the single-label
    // classifier fix). Matches so the tag list only shows tags that appear
    // on articles actually in the currently selected tab (Vulnerability /
    // Incident / Other), not the whole category regardless of tab.
    where.push(`EXISTS (
      SELECT 1 FROM article_tags at3
      JOIN tags t3 ON at3.tag_id = t3.id
      WHERE at3.article_id = a.id AND t3.name = ?
    )`);
    binds.push(`sub:${opts.subcategory}`);
  }

  const sql = `
    SELECT t.name, COUNT(DISTINCT a.id) AS cnt
    FROM tags t
    JOIN article_tags at ON t.id = at.tag_id
    JOIN articles    a  ON at.article_id = a.id
    ${where.length ? "WHERE " + where.join(" AND ") : ""}
    GROUP BY t.name
    ORDER BY t.name
  `;
  const res = await env.DB.prepare(sql).bind(...binds).all();
  return (res.results ?? [])
    .map(r => ({ name: (r as { name: string }).name, count: Number((r as { cnt: number }).cnt) }))
    .filter(t => !isControlTag(t.name));
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
