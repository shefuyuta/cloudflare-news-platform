// lib/rag/chat.ts
import type { Env, NewsArticle, ChatRequest, Citation } from "../types";
import { loadRuntimeConfig, type RagConfig } from "./config";
import { retrieve, toCitations } from "./retriever";
import { scrapeMultiple } from "./scraper";
import { fetchNewsStats } from "./stats";

/**
 * Run one chat turn:
 *   1. Load runtime config
 *   2. Fetch DB metadata stats + dynamic keyword counts from user's question
 *   3. Retrieve relevant articles from Vectorize
 *   4. Fetch live content from article URLs (on-demand scraping)
 *   5. Build a context-rich prompt
 *   6. Call Workers AI and return JSON with answer + citations
 */
export async function runChat(env: Env, req: ChatRequest): Promise<Response> {
  try {
    const cfg = await loadRuntimeConfig(env);

    // 1. Fetch stats (with keyword search) and retrieve articles in parallel
    const [stats, hits] = await Promise.all([
      fetchNewsStats(env, req.message),
      retrieve(env, req.message, req.context, cfg),
    ]);

    const citations = toCitations(hits);

    // 2. Fetch live content from top article URLs
    const urlsToFetch = hits
      .slice(0, 4)
      .map(h => h.article.url);

    const liveContent = await scrapeMultiple(urlsToFetch, 3);

    // 3. Build prompt with stats + live content
    const systemMsg = buildSystemPrompt(cfg, stats, hits.map(h => ({
      article: h.article,
      text: h.chunkText,
      liveContent: liveContent.get(h.article.url) ?? null,
    })));

    const messages: { role: "system" | "user" | "assistant"; content: string }[] = [
      { role: "system", content: systemMsg },
      ...(req.history ?? []).slice(-6),
      { role: "user", content: req.message },
    ];

    // 4. Call Workers AI
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
  stats: string,
  sources: { article: NewsArticle; text?: string; liveContent?: string | null }[],
): string {
  const today = new Date().toISOString().slice(0, 10);

  const block = sources.length
    ? sources.map((s, i) => {
        const body = (s.liveContent ?? s.text ?? s.article.summary ?? "")
          .slice(0, cfg.contextCharsPerSource);
        const contentSource = s.liveContent ? "[full article]" : s.text ? "[excerpt]" : "[summary only]";
        return `[${i + 1}] ${contentSource} (${s.article.source} — ${s.article.url})\n${s.article.title}\n${body}`;
      }).join("\n\n")
    : "(no sources matched the user's filters)";

  return cfg.systemPrompt
    .replace("{{date}}", today)
    .replace("{{stats}}", stats)
    .replace("{{context}}", block);
}

export type { Citation };
