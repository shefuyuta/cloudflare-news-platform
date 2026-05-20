// workers/fetcher/index.ts
// ---------------------------------------------------------------------
// Cloudflare Worker: RSS Feed Fetcher for NewsHub
//
// Runs on a Cron schedule (default: every 2 hours).
// Fetches all configured RSS feeds, parses articles, classifies them,
// and POSTs them to the main app's /api/ingest endpoint.
//
// Can also be triggered manually via HTTP GET for testing.
// ---------------------------------------------------------------------

import { FEEDS, type FeedSource } from "./feeds";
import { parseFeed, type ParsedItem } from "./parser";
import { classifyRegion, classifySubcategory, extractTags } from "./classifier";

export interface Env {
  /** The public URL of the main NewsHub app (e.g. https://cloudflare-news-platform.shefutech.workers.dev) */
  INGEST_URL: string;
  /** Optional shared secret to authenticate ingest calls */
  INGEST_SECRET?: string;
}

const FETCH_HEADERS = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36",
  "Accept": "application/rss+xml, application/atom+xml, application/xml, text/xml, */*",
  "Accept-Language": "ja,en-US;q=0.8,en;q=0.7",
};

/** Max age of articles to ingest (hours). Older ones are skipped. */
const MAX_AGE_HOURS = 72;

/** How many articles to send per /api/ingest batch call. */
const BATCH_SIZE = 20;

// =====================================================================
// Entry points
// =====================================================================

export default {
  /** Cron trigger — runs on schedule defined in wrangler.toml */
  async scheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext) {
    ctx.waitUntil(runFetcher(env));
  },

  /** HTTP trigger — for manual testing: GET /  */
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/run" || url.pathname === "/") {
      ctx.waitUntil(runFetcher(env));
      return new Response(JSON.stringify({ status: "started", feeds: FEEDS.length }), {
        headers: { "Content-Type": "application/json" },
      });
    }

    return new Response("NewsHub Fetcher Worker\nGET /run to trigger manually", { status: 200 });
  },
};

// =====================================================================
// Core logic
// =====================================================================

async function runFetcher(env: Env): Promise<void> {
  console.log(`[fetcher] Starting. ${FEEDS.length} sources configured.`);

  const cutoff = new Date(Date.now() - MAX_AGE_HOURS * 3600_000);
  const allArticles: IngestArticle[] = [];
  const seenUrls = new Set<string>();

  // Fetch all feeds concurrently (grouped by source to limit parallelism)
  const results = await Promise.allSettled(
    FEEDS.map(source => fetchSource(source, cutoff, seenUrls))
  );

  for (const r of results) {
    if (r.status === "fulfilled") {
      allArticles.push(...r.value);
    }
  }

  console.log(`[fetcher] Parsed ${allArticles.length} articles total.`);

  if (!allArticles.length) {
    console.log("[fetcher] No new articles. Done.");
    return;
  }

  // Sort by publishedAt descending, then batch-post to /api/ingest
  allArticles.sort((a, b) => b.publishedAt.localeCompare(a.publishedAt));

  let ingested = 0;
  for (let i = 0; i < allArticles.length; i += BATCH_SIZE) {
    const batch = allArticles.slice(i, i + BATCH_SIZE);
    try {
      await postIngest(env, batch);
      ingested += batch.length;
    } catch (e) {
      console.error(`[fetcher] Ingest batch failed:`, e);
    }
  }

  console.log(`[fetcher] Done. Ingested ${ingested}/${allArticles.length} articles.`);

  const baseUrl = env.INGEST_URL.replace(/\/$/, "");

  // ── Importance scoring ───────────────────────────────────────────────
  if (ingested > 0) {
    try {
      let remaining = ingested;
      let rounds = 0;
      while (remaining > 0 && rounds < 5) {
        const scoreResp = await fetch(`${baseUrl}/api/score-articles`, { method: "POST" });
        if (!scoreResp.ok) break;
        const scoreData = await scoreResp.json() as { scored: number; remaining: number };
        remaining = scoreData.remaining;
        if (scoreData.scored === 0) break;
        rounds++;
      }
      console.log(`[fetcher] Scoring complete after ${rounds} rounds.`);
    } catch (e) {
      console.warn("[fetcher] Scoring failed (non-critical):", e);
    }
  }

  // ── Cleanup old articles (always run, regardless of ingestion count) ──
  try {
    const cleanupResp = await fetch(`${baseUrl}/api/cleanup`, { method: "POST" });
    if (cleanupResp.ok) {
      const cleanupData = await cleanupResp.json() as { deleted: number };
      if (cleanupData.deleted > 0) {
        console.log(`[fetcher] Cleanup: removed ${cleanupData.deleted} old articles.`);
      }
    }
  } catch (e) {
    console.warn("[fetcher] Cleanup failed (non-critical):", e);
  }
}

// =====================================================================
// Per-source fetching
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
  importanceScore?: number;
}

async function fetchSource(
  source: FeedSource,
  cutoff: Date,
  seenUrls: Set<string>,
): Promise<IngestArticle[]> {
  const articles: IngestArticle[] = [];

  for (const feedUrl of source.urls) {
    try {
      const resp = await fetch(feedUrl, {
        headers: FETCH_HEADERS,
        cf: { cacheTtl: 600 },  // Cache at edge for 10 min
      });

      if (!resp.ok) {
        console.warn(`[fetcher] ${source.name} ${resp.status}: ${feedUrl}`);
        continue;
      }

      const xml = await resp.text();
      const items = parseFeed(xml);

      for (const item of items) {
        // Skip if already seen (dedup across feeds)
        if (seenUrls.has(item.url)) continue;
        seenUrls.add(item.url);

        // Skip if too old
        const pubDate = new Date(item.publishedAt);
        if (pubDate < cutoff) continue;

        // Classify
        const region = source.category === "general"
          ? classifyRegion(source, item.title, item.summary)
          : undefined;

        const subcategory = source.category === "cybersecurity"
          ? classifySubcategory(source, item.title, item.summary)
          : undefined;

        const tags = extractTags(source.category, item.title, item.summary);

        articles.push({
          title: item.title,
          url: item.url,
          source: source.name,
          category: source.category,
          region,
          subcategory,
          tags,
          summary: item.summary || undefined,
          publishedAt: item.publishedAt,
        });
      }
    } catch (e) {
      console.warn(`[fetcher] ${source.name} error on ${feedUrl}:`, e);
    }
  }

  if (articles.length) {
    console.log(`[fetcher] ${source.name}: ${articles.length} articles`);
  }

  return articles;
}

// =====================================================================
// Ingest API call
// =====================================================================

async function postIngest(env: Env, articles: IngestArticle[]): Promise<void> {
  const url = `${env.INGEST_URL.replace(/\/$/, "")}/api/ingest`;

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (env.INGEST_SECRET) {
    headers["Authorization"] = `Bearer ${env.INGEST_SECRET}`;
  }

  const resp = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify({ articles }),
  });

  if (!resp.ok) {
    const body = await resp.text().catch(() => "");
    throw new Error(`Ingest API ${resp.status}: ${body.slice(0, 200)}`);
  }
}
