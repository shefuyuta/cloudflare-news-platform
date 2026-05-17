// app/api/ingest/route.ts
//
// Ingest one or more articles. The fetcher Worker (workers_backup/fetcher)
// can POST here, OR you can invoke this directly during dev with curl.
//
// For every article:
//   1. Upsert into D1 `articles`
//   2. Normalize tags via tags + article_tags (many-to-many)
//   3. Chunk body → embed → write vectors to Vectorize with metadata
//      ({ article_id, category, region, subcategory, text }) so the
//      retriever can filter by view.

import { NextResponse } from "next/server";
import { getRequestContext } from "@opennextjs/cloudflare";
import { loadRuntimeConfig } from "@/lib/rag/config";
import { embedBatch, chunk } from "@/lib/rag/embeddings";
import { upsertTags, setArticleTags } from "@/lib/db";
import type { Env } from "@/lib/types";
import type { Category } from "@/lib/categories";

export const runtime = "edge";

interface IngestArticle {
  id?: string;
  title: string;
  url: string;
  source: string;
  category: Category;
  region?: string;
  subcategory?: string;
  tags?: string[];
  summary?: string;
  content?: string;
  importanceScore?: number;
  publishedAt?: string;           // ISO 8601; defaults to "now"
}

export async function POST(req: Request): Promise<Response> {
  const env = getRequestContext().env as unknown as Env;
  const cfg = await loadRuntimeConfig(env);

  let payload: { articles: IngestArticle[] };
  try { payload = await req.json(); }
  catch { return new Response("Invalid JSON", { status: 400 }); }

  const out: { id: string; vectors: number; skipped?: string }[] = [];

  for (const a of payload.articles ?? []) {
    if (!a.title || !a.url || !a.source || !a.category) {
      out.push({ id: a.id ?? a.url, vectors: 0, skipped: "missing required field" });
      continue;
    }

    const id          = a.id ?? hashUrl(a.url);
    const publishedAt = a.publishedAt ?? new Date().toISOString();
    const tags        = (a.tags ?? []).map(s => s.trim()).filter(Boolean);

    // 1. Upsert article row -----------------------------------------
    await env.DB.prepare(`
      INSERT INTO articles (id, title, summary, content, category, subcategory, region,
                            source, url, importance_score, published_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?)
      ON CONFLICT(url) DO UPDATE SET
        title=excluded.title, summary=excluded.summary, content=excluded.content,
        category=excluded.category, subcategory=excluded.subcategory, region=excluded.region,
        source=excluded.source, importance_score=excluded.importance_score,
        published_at=excluded.published_at
    `).bind(
      id, a.title, a.summary ?? null, a.content ?? null,
      a.category, a.subcategory ?? null, a.region ?? null,
      a.source, a.url, a.importanceScore ?? null, publishedAt,
    ).run();

    // 2. Tags: upsert names + replace article_tags links ------------
    if (tags.length) {
      const tagIds = await upsertTags(env, tags);
      await setArticleTags(env, id, tagIds);
    } else {
      await setArticleTags(env, id, []);
    }

    // 3. Chunk + embed + upsert vectors -----------------------------
    const body    = a.content?.trim() || a.summary?.trim() || a.title;
    const chunks  = chunk(body);
    const vectors = await embedBatch(env, chunks, cfg);

    if (vectors.length) {
      await env.VECTORIZE.upsert(vectors.map((values, i) => ({
        id: `${id}#${i}`,
        values,
        metadata: {
          article_id:  id,
          category:    a.category,
          region:      a.region      ?? "",
          subcategory: a.subcategory ?? "",
          text:        chunks[i].slice(0, 1500),
        },
      })));
    }

    await env.DB.prepare(
      "UPDATE articles SET vector_id = ?, embedded_at = ? WHERE id = ?",
    ).bind(`${id}#0`, new Date().toISOString(), id).run();

    out.push({ id, vectors: vectors.length });
  }

  return NextResponse.json({ ingested: out });
}

/** Deterministic 32-char hex hash of a URL — works on the edge runtime. */
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
