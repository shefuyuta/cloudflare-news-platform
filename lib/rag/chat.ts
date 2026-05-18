// lib/rag/chat.ts
import type { Env, NewsArticle, ChatRequest, Citation } from "../types";
import { loadRuntimeConfig, type RagConfig } from "./config";
import { retrieve, toCitations } from "./retriever";

/**
 * Run one chat turn (non-streaming, JSON response):
 *   1. Load runtime config (D1 overrides + code defaults)
 *   2. Retrieve sources from Vectorize, scoped to the user's view
 *   3. Build a strict, citation-friendly prompt
 *   4. Call Workers AI and return JSON with answer + citations
 */
export async function runChat(env: Env, req: ChatRequest): Promise<Response> {
  try {
    const cfg = await loadRuntimeConfig(env);

    const hits      = await retrieve(env, req.message, req.context, cfg);
    const citations = toCitations(hits);
    const systemMsg = buildSystemPrompt(cfg, hits.map(h => ({ article: h.article, text: h.chunkText })));

    const messages: { role: "system" | "user" | "assistant"; content: string }[] = [
      { role: "system", content: systemMsg },
      ...(req.history ?? []).slice(-6),
      { role: "user", content: req.message },
    ];

    // Non-streaming call to Workers AI
    const result = await env.AI.run(cfg.llmModel, {
      messages,
      temperature: cfg.temperature,
      max_tokens: cfg.maxTokens,
    } as Record<string, unknown>) as { response?: string };

    const answer = result?.response ?? "No response from AI.";

    return new Response(JSON.stringify({ answer, citations }), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("[chat] Error:", e);
    return new Response(JSON.stringify({
      answer: "An error occurred while processing your question.",
      citations: [],
      error: String(e),
    }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}

function buildSystemPrompt(
  cfg: RagConfig,
  sources: { article: NewsArticle; text?: string }[],
): string {
  const today = new Date().toISOString().slice(0, 10);

  const block = sources.length
    ? sources.map((s, i) => {
        const body = (s.text ?? s.article.summary ?? "").slice(0, cfg.contextCharsPerSource);
        return `[${i + 1}] (${s.article.source} — ${s.article.url})\n${s.article.title}\n${body}`;
      }).join("\n\n")
    : "(no sources matched the user's filters)";

  return cfg.systemPrompt.replace("{{date}}", today).replace("{{context}}", block);
}

export type { Citation };
