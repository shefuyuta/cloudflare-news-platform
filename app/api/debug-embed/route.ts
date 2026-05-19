// app/api/debug-embed/route.ts
// Diagnostic: try to embed one article and return the result or error.
// DELETE THIS FILE after debugging is complete.

import { NextResponse } from "next/server";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { loadRuntimeConfig } from "@/lib/rag/config";
import { embedBatch, chunk } from "@/lib/rag/embeddings";
import type { Env } from "@/lib/types";

export async function GET(): Promise<Response> {
  const env = (await getCloudflareContext()).env as unknown as Env;
  const diag: Record<string, unknown> = {};

  try {
    // 1. Check D1
    const row = await env.DB.prepare(
      "SELECT id, title, summary FROM articles WHERE summary IS NOT NULL LIMIT 1"
    ).first() as { id: string; title: string; summary: string } | null;

    if (!row) {
      return NextResponse.json({ error: "No articles with summary in D1" });
    }
    diag.article = { id: row.id, title: row.title.slice(0, 50) };

    // 2. Load RAG config
    const cfg = await loadRuntimeConfig(env);
    diag.config = {
      embeddingModel: cfg.embeddingModel,
      llmModel: cfg.llmModel,
      topK: cfg.topK,
    };

    // 3. Try chunking
    const text = row.summary || row.title;
    const chunks = chunk(text);
    diag.chunks = { count: chunks.length, firstChunkLength: chunks[0]?.length };

    // 4. Try embedding
    try {
      const vectors = await embedBatch(env, chunks, cfg);
      diag.embedding = {
        success: true,
        vectorCount: vectors.length,
        dimensions: vectors[0]?.length,
      };

      // 5. Try Vectorize upsert
      try {
        await env.VECTORIZE.upsert([{
          id: `debug-test-${Date.now()}`,
          values: vectors[0],
          metadata: {
            article_id: row.id,
            category: "general",
            region: "",
            subcategory: "",
            text: chunks[0].slice(0, 100),
          },
        }]);
        diag.vectorize = { success: true };
      } catch (e) {
        diag.vectorize = { success: false, error: String(e) };
      }
    } catch (e) {
      diag.embedding = { success: false, error: String(e) };
    }

    // 6. Try LLM
    try {
      const result = await env.AI.run(cfg.llmModel, {
        messages: [{ role: "user", content: "Say hello in one word." }],
        max_tokens: 10,
      } as Record<string, unknown>) as { response?: string };
      diag.llm = { success: true, response: result?.response };
    } catch (e) {
      diag.llm = { success: false, error: String(e) };
    }

  } catch (e) {
    diag.fatal = String(e);
  }

  return NextResponse.json(diag, {
    headers: { "Content-Type": "application/json" },
  });
}
