// app/api/debug-search/route.ts
// Diagnostic: trace each stage of semantic search to find where results
// drop to zero. DELETE after debugging.
//   GET /api/debug-search?q=ランサム
import { NextResponse } from "next/server";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { loadRuntimeConfig } from "@/lib/rag/config";
import { embed } from "@/lib/rag/embeddings";
import { semanticSearch } from "@/lib/search/semantic";
import type { Env } from "@/lib/types";

export async function GET(req: Request): Promise<Response> {
  const env = (await getCloudflareContext()).env as unknown as Env;
  const url = new URL(req.url);
  const q = url.searchParams.get("q") ?? "ransomware";
  const diag: Record<string, unknown> = { query: q };

  try {
    const cfg = await loadRuntimeConfig(env);
    diag.config = { embeddingModel: cfg.embeddingModel, minScore: cfg.minScore, topK: cfg.topK };

    // 1. Embed the query
    const vec = await embed(env, q, cfg);
    diag.queryVector = { dims: vec.length, sample: vec.slice(0, 3) };

    // 2. Raw Vectorize query — NO filter, high topK, to see everything
    const search = await env.VECTORIZE.query(vec, {
      topK: 10,
      returnValues: false,
      returnMetadata: "all",
    });

    const matches = (search.matches ?? []).map(m => ({
      id: m.id,
      score: Number(m.score.toFixed(4)),
      article_id: (m.metadata as Record<string, unknown> | undefined)?.article_id,
      category: (m.metadata as Record<string, unknown> | undefined)?.category,
      textSnippet: String((m.metadata as Record<string, unknown> | undefined)?.text ?? "").slice(0, 60),
    }));
    diag.vectorizeMatches = { count: matches.length, matches };

    // 3. Check if those article_ids exist in D1
    const ids = matches.map(m => m.article_id).filter(Boolean) as string[];
    if (ids.length) {
      const ph = ids.map(() => "?").join(",");
      const res = await env.DB.prepare(
        `SELECT id, title, published_at FROM articles WHERE id IN (${ph})`
      ).bind(...ids).all();
      diag.d1Hydration = {
        idsFromVectorize: ids.length,
        foundInD1: (res.results ?? []).length,
        titles: (res.results ?? []).map(r => ({
          id: (r as { id: string }).id,
          title: String((r as { title: string }).title).slice(0, 50),
          published_at: (r as { published_at: string }).published_at,
        })),
      };
    } else {
      diag.d1Hydration = { note: "No article_id metadata on any match" };
    }

    // 4. Total embedded articles for context
    const cnt = await env.DB.prepare(
      "SELECT COUNT(*) AS total, COUNT(vector_id) AS embedded FROM articles"
    ).first();
    diag.dbCounts = cnt;

    // 5. Call the REAL semanticSearch exactly as the search page does,
    //    to see where it drops to zero (mirrors /search?q=... path).
    try {
      const real = await semanticSearch(env, cfg, {
        query: q,
        noTimeLimit: true,
        limit: 200,
      });
      diag.realSemanticSearch = {
        returned: real.length,
        titles: real.slice(0, 5).map(a => a.title.slice(0, 50)),
      };
    } catch (e2) {
      diag.realSemanticSearch = {
        threw: true,
        error: e2 instanceof Error ? `${e2.name}: ${e2.message}` : String(e2),
        stack: e2 instanceof Error ? e2.stack?.slice(0, 600) : undefined,
      };
    }

  } catch (e) {
    diag.error = e instanceof Error ? `${e.name}: ${e.message}` : String(e);
    diag.stack = e instanceof Error ? e.stack?.slice(0, 500) : undefined;
  }

  return NextResponse.json(diag, { status: 200 });
}
