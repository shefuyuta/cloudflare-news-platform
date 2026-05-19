// app/api/fetch-news/route.ts
// ---------------------------------------------------------------------
// Browser-triggered RSS fetch. Saves to D1 only (fast).
// Embedding is handled separately by /api/embed-missing.
// ---------------------------------------------------------------------

import { NextResponse } from "next/server";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { FEEDS, type FeedSource } from "@/lib/fetcher/feeds";
import { parseFeed } from "@/lib/fetcher/parser";
import { classifyCategory, classifyRegion, classifySubcategory, extractTags } from "@/lib/fetcher/classifier";
import { upsertTags, setArticleTags } from "@/lib/db";
import type { Env } from "@/lib/types";

const FETCH_HEADERS = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
  "Accept": "application/rss+xml, application/atom+xml, application/xml, text/xml, */*",
};

const MAX_AGE_HOURS = 72;

export async function POST(): Promise<Response> {
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

  return NextResponse.json({
    fetched,
    ingested,
    errors,
    sources: FEEDS.length,
    elapsed: `${((Date.now() - startTime) / 1000).toFixed(1)}s`,
  });
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

        const category = classifyCategory(source, item.title, item.summary);

        const region = category === "general"
          ? classifyRegion(source, item.title, item.summary)
          : undefined;

        const subcategory = category === "cybersecurity"
          ? classifySubcategory(source, item.title, item.summary)
          : undefined;

        const tags = extractTags(category, item.title, item.summary);

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
