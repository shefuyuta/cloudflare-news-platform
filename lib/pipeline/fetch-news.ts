// lib/pipeline/fetch-news.ts
// ---------------------------------------------------------------------
// Core RSS fetch + ingest pipeline, callable directly with an `env`.
//
// Extracted from the API route so BOTH the browser route
// (app/api/fetch-news/route.ts) AND the cron scheduled handler
// (worker.ts) can run it. The cron previously self-fetched the HTTP
// route, but a scheduled handler cannot wait for a self-request to
// finish (the context closes first, so fetch-news never ran and
// last_fetch_at never updated from cron). Calling this function directly
// keeps everything in one Worker invocation.
// ---------------------------------------------------------------------

import { FEEDS, type FeedSource } from "../fetcher/feeds";
import { parseFeed } from "../fetcher/parser";
import { classifyCategoryMulti, classifyRegion, classifySubcategories, extractTags } from "../fetcher/classifier";
import type { Env } from "../types";

const FETCH_HEADERS = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
  "Accept": "application/rss+xml, application/atom+xml, application/xml, text/xml, */*",
};

const MAX_AGE_HOURS = 72;

export interface FetchNewsResult {
  fetched: number;
  ingested: number;
  errors: number;
  fetchedAt: string;
  sources: number;
  elapsed: string;
}

export async function runFetchNews(env: Env): Promise<FetchNewsResult> {
  const startTime = Date.now();
  const cutoff = new Date(Date.now() - MAX_AGE_HOURS * 3600_000);
  const seenUrls = new Set<string>();

  let fetched = 0;
  let ingested = 0;
  let errors = 0;

  // Fetch all sources concurrently.
  const results = await Promise.allSettled(
    FEEDS.map(source => fetchSource(source, cutoff, seenUrls)),
  );

  const allArticles: IngestArticle[] = [];
  for (const r of results) {
    if (r.status === "fulfilled") {
      allArticles.push(...r.value);
      fetched += r.value.length;
    } else {
      errors++;
    }
  }

  allArticles.sort((a, b) => b.publishedAt.localeCompare(a.publishedAt));

  // Record fetch time FIRST — before the ingest consumes the subrequest
  // budget — so the timestamp is written even if ingest partially fails.
  const fetchedAt = new Date().toISOString();
  try {
    await env.DB.prepare(
      `INSERT INTO rag_config (key, value) VALUES ('last_fetch_at', ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
    ).bind(fetchedAt).run();
  } catch (e) {
    console.warn("[fetch-news] Failed to record last_fetch_at", e);
  }

  // Batched ingest (subrequest-efficient).
  try {
    const r = await ingestBatch(env, allArticles);
    ingested = r.ingested;
    errors  += r.errors;
  } catch (e) {
    console.warn("[fetch-news] Batch ingest failed", e);
    errors += allArticles.length;
  }

  return {
    fetched,
    ingested,
    errors,
    fetchedAt,
    sources: FEEDS.length,
    elapsed: `${((Date.now() - startTime) / 1000).toFixed(1)}s`,
  };
}

// =====================================================================
// RSS fetch + parse per source
// =====================================================================

interface IngestArticle {
  title: string;
  url: string;
  source: string;
  category: "general" | "cybersecurity" | "ai";
  region?: string;
  subcategory?: string;
  tags: string[];
  summary?: string;
  publishedAt: string;
}

async function fetchSource(
  source: FeedSource,
  cutoff: Date,
  seenUrls: Set<string>,
): Promise<IngestArticle[]> {
  const articles: IngestArticle[] = [];

  for (const feedUrl of source.urls) {
    try {
      const resp = await fetch(feedUrl, { headers: FETCH_HEADERS });
      if (!resp.ok) continue;

      const xml = await resp.text();
      const items = parseFeed(xml);

      for (const item of items) {
        if (seenUrls.has(item.url)) continue;
        seenUrls.add(item.url);

        const pubDate = new Date(item.publishedAt);
        if (pubDate < cutoff) continue;

        const { category, crossLabels } = classifyCategoryMulti(source, item.title, item.summary);

        const region = category === "general"
          ? classifyRegion(source, item.title, item.summary)
          : undefined;

        const subLabels = category === "cybersecurity"
          ? classifySubcategories(source, item.title, item.summary)
          : [];
        const subcategory = subLabels[0];

        const tags = [...new Set([
          ...extractTags(category, item.title, item.summary),
          ...crossLabels,
          ...subLabels.map(s => `sub:${s}`),
        ])];

        articles.push({
          title: item.title,
          url: item.url,
          source: source.name,
          category,
          region,
          subcategory,
          tags,
          summary: item.summary || undefined,
          publishedAt: item.publishedAt,
        });
      }
    } catch {
      // Skip failed feeds silently.
    }
  }
  return articles;
}

// =====================================================================
// D1 insert only (no Vectorize) — batched for subrequest efficiency
// =====================================================================

async function ingestBatch(
  env: Env,
  articles: IngestArticle[],
): Promise<{ ingested: number; errors: number }> {
  if (!articles.length) return { ingested: 0, errors: 0 };

  const BATCH = 50;
  let errors = 0;

  const withIds = articles.map(a => ({ a, id: hashUrl(a.url) }));
  const uniqueTags = [...new Set(articles.flatMap(a => a.tags).filter(Boolean))];

  // 1. Bulk-upsert tags, resolve ids.
  const tagIdByName = new Map<string, number>();
  if (uniqueTags.length) {
    for (let i = 0; i < uniqueTags.length; i += BATCH) {
      const chunk = uniqueTags.slice(i, i + BATCH);
      try {
        await env.DB.prepare(
          "INSERT OR IGNORE INTO tags (name) VALUES " + chunk.map(() => "(?)").join(","),
        ).bind(...chunk).run();
        const ph = chunk.map(() => "?").join(",");
        const res = await env.DB.prepare(
          `SELECT id, name FROM tags WHERE name IN (${ph})`,
        ).bind(...chunk).all();
        for (const row of res.results ?? []) {
          tagIdByName.set((row as { name: string }).name, (row as { id: number }).id);
        }
      } catch (e) {
        console.warn("[fetch-news] tag chunk failed", e);
      }
    }
  }

  // 2. Batch-insert article rows.
  let ingested = 0;
  for (let i = 0; i < withIds.length; i += BATCH) {
    const chunk = withIds.slice(i, i + BATCH);
    const stmts = chunk.map(({ a, id }) =>
      env.DB.prepare(`
        INSERT INTO articles (id, title, summary, category, subcategory, region,
                              source, url, published_at)
        VALUES (?,?,?,?,?,?,?,?,?)
        ON CONFLICT(url) DO UPDATE SET
          title=excluded.title, summary=excluded.summary,
          category=excluded.category, subcategory=excluded.subcategory, region=excluded.region,
          source=excluded.source, published_at=excluded.published_at
      `).bind(
        id, a.title, a.summary ?? null,
        a.category, a.subcategory ?? null, a.region ?? null,
        a.source, a.url, a.publishedAt,
      ),
    );
    try {
      await env.DB.batch(stmts);
      ingested += chunk.length;
    } catch (e) {
      console.warn("[fetch-news] article batch failed", e);
      errors += chunk.length;
    }
  }

  // 3. Batch-insert article_tags (delete + insert per article).
  const tagStmts = [];
  for (const { a, id } of withIds) {
    const tagIds = a.tags.map(t => tagIdByName.get(t)).filter((x): x is number => !!x);
    tagStmts.push(env.DB.prepare("DELETE FROM article_tags WHERE article_id = ?").bind(id));
    if (tagIds.length) {
      const vals = tagIds.map(() => "(?, ?)").join(",");
      const binds: unknown[] = [];
      for (const tid of tagIds) { binds.push(id, tid); }
      tagStmts.push(
        env.DB.prepare(`INSERT OR IGNORE INTO article_tags (article_id, tag_id) VALUES ${vals}`).bind(...binds),
      );
    }
  }
  for (let i = 0; i < tagStmts.length; i += BATCH) {
    const chunk = tagStmts.slice(i, i + BATCH);
    try {
      await env.DB.batch(chunk);
    } catch (e) {
      console.warn("[fetch-news] article_tags batch failed", e);
    }
  }

  return { ingested, errors };
}

function hashUrl(url: string): string {
  let h1 = 0xdeadbeef, h2 = 0x41c6ce57;
  for (let i = 0; i < url.length; i++) {
    const c = url.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 2654435761);
    h2 = Math.imul(h2 ^ c, 1597334677);
  }
  h1 = (h1 ^ (h1 >>> 16)) >>> 0;
  h2 = (h2 ^ (h2 >>> 16)) >>> 0;
  return (h1.toString(16).padStart(8, "0") + h2.toString(16).padStart(8, "0")).repeat(2);
}
