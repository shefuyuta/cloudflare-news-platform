// app/api/fetch-news/route.ts
// ---------------------------------------------------------------------
// Browser-triggered RSS fetch. Saves to D1 only (fast).
// Embedding is handled separately by /api/embed-missing.
// ---------------------------------------------------------------------

import { NextResponse } from "next/server";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { FEEDS, type FeedSource } from "@/lib/fetcher/feeds";
import { parseFeed } from "@/lib/fetcher/parser";
import { classifyCategoryMulti, classifyRegion, classifySubcategories, extractTags } from "@/lib/fetcher/classifier";
import { upsertTags, setArticleTags } from "@/lib/db";
import type { Env } from "@/lib/types";

const FETCH_HEADERS = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
  "Accept": "application/rss+xml, application/atom+xml, application/xml, text/xml, */*",
};

const MAX_AGE_HOURS = 72;

export async function POST(req: Request): Promise<Response> {
  const startTime = Date.now();
  const env = (await getCloudflareContext()).env as unknown as Env;
  const cutoff = new Date(Date.now() - MAX_AGE_HOURS * 3600_000);
  const seenUrls = new Set<string>();

  let fetched = 0;
  let ingested = 0;
  let errors = 0;

  // Fetch all sources concurrently
  const results = await Promise.allSettled(
    FEEDS.map(source => fetchSource(source, cutoff, seenUrls))
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

  // Sort newest first
  allArticles.sort((a, b) => b.publishedAt.localeCompare(a.publishedAt));

  // Insert into D1 only (no embedding — that's done by /api/embed-missing)
  for (const a of allArticles) {
    try {
      await ingestArticle(env, a);
      ingested++;
    } catch (e) {
      console.warn(`[fetch-news] Failed to ingest: ${a.url}`, e);
      errors++;
    }
  }

  // Record the fetch execution time in rag_config so the Header can show
  // a "last updated" timestamp. Both manual refresh and the future cron
  // call this route, so both write here and the timestamp reflects either
  // path (per design decision).
  const fetchedAt = new Date().toISOString();
  try {
    await env.DB.prepare(
      `INSERT INTO rag_config (key, value) VALUES ('last_fetch_at', ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value`
    ).bind(fetchedAt).run();
  } catch (e) {
    console.warn("[fetch-news] Failed to record last_fetch_at", e);
  }

  // Kick off embedding for the newly-ingested articles. embed-missing
  // processes in bounded batches (≤30/run) and returns `remaining`, so we
  // chain calls until the backlog is drained. Done as fire-and-forget
  // fetches so the fetch-news response isn't blocked; the future cron gets
  // the same behaviour for free because it calls this same route.
  const origin = new URL(req.url).origin;
  void drainEmbeddings(origin);

  return NextResponse.json({
    fetched,
    ingested,
    errors,
    fetchedAt,
    sources: FEEDS.length,
    elapsed: `${((Date.now() - startTime) / 1000).toFixed(1)}s`,
  });
}

/**
 * Repeatedly call /api/embed-missing until no articles remain unembedded
 * (or a safety cap is hit). Fire-and-forget: errors are swallowed so a
 * transient embedding failure never breaks the fetch response.
 */
async function drainEmbeddings(origin: string): Promise<void> {
  const MAX_ROUNDS = 60; // safety cap (60 × 30 = up to 1800 articles/fetch)
  try {
    for (let i = 0; i < MAX_ROUNDS; i++) {
      const res = await fetch(`${origin}/api/embed-missing`, { method: "POST" });
      if (!res.ok) break;
      const data = await res.json() as { remaining?: number; embedded?: number };
      if (!data || (data.remaining ?? 0) <= 0) break;
    }
  } catch {
    // Swallow — embedding can be retried by a later fetch or manual call.
  }
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

        // Multi-label subcategory. Primary column value = first label
        // (higher-scored); the full set is emitted as sub:* tags so an
        // article can live on both the vulnerability and incident tabs.
        const subLabels = category === "cybersecurity"
          ? classifySubcategories(source, item.title, item.summary)
          : [];
        const subcategory = subLabels[0];

        // Base content tags + cross-cut desk labels (AI/Cyber) so a
        // story that is primarily one desk still surfaces on the other,
        // + sub:* labels for multi-label subcategory filtering.
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
      // Skip failed feeds silently
    }
  }
  return articles;
}

// =====================================================================
// D1 insert only (no Vectorize)
// =====================================================================

async function ingestArticle(env: Env, a: IngestArticle): Promise<void> {
  const id = hashUrl(a.url);

  await env.DB.prepare(`
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
  ).run();

  if (a.tags.length) {
    const tagIds = await upsertTags(env, a.tags);
    await setArticleTags(env, id, tagIds);
  }
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
