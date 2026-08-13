// lib/rag/chat.ts
import type { Env, NewsArticle, ChatRequest, Citation } from "../types";
import { loadRuntimeConfig, type RagConfig } from "./config";
import { retrieve, toCitations } from "./retriever";
import { scrapeMultiple } from "./scraper";
import { looksRansomwareRelated, buildRansomwareStats } from "./ransomware-tool";

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

    // 1. Retrieve relevant articles from Vectorize (semantic search over all
    //    history). No keyword-stats side-channel — it fed the model a "0
    //    matches" count for the literal query string and made it answer
    //    "0 articles found" even when semantic search returned sources.
    const ransomwareCheck = looksRansomwareRelated(req.message)
      ? buildRansomwareStats(env, req.message)
      : Promise.resolve({ block: "", empty: true });
    const [hits, ransomwareStats] = await Promise.all([
      retrieve(env, req.message, req.context, cfg),
      ransomwareCheck,
    ]);

    const citations = toCitations(hits);

    // 2. Fetch live content from top article URLs
    const urlsToFetch = hits
      .slice(0, 4)
      .map(h => h.article.url);

    const liveContent = await scrapeMultiple(urlsToFetch, 3);

    // 3. Build prompt with live content
    const systemMsg = buildSystemPrompt(cfg, hits.map(h => ({
      article: h.article,
      text: h.chunkText,
      liveContent: liveContent.get(h.article.url) ?? null,
    })), ransomwareStats.empty ? "" : ransomwareStats.block);

    const messages: { role: "system" | "user" | "assistant"; content: string }[] = [
      { role: "system", content: systemMsg },
      ...(req.history ?? []).slice(-6),
      { role: "user", content: req.message },
    ];

    // 4. Call Workers AI
    const result = await (env.AI as { run: (m: string, o: object) => Promise<unknown> }).run(cfg.llmModel, {
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
  sources: { article: NewsArticle; text?: string; liveContent?: string | null }[],
  ransomwareStats: string,
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

  // Ransomware activity numbers, when present, are a real SQL aggregate —
  // not something to cite with [n] or blend with the article sources above.
  const ransomwareBlock = ransomwareStats
    ? `\n\n<ransomware_stats>\nThe following are exact counts from the ransomware tracking database. Use ` +
      `these numbers directly for any question about ransomware group activity, victim counts, or trends. ` +
      `Do not cite this block with [n] — just state the numbers plainly.\n${ransomwareStats}</ransomware_stats>`
    : "";

  return cfg.systemPrompt
    .replace("{{date}}", today)
    .replace("{{context}}", block + ransomwareBlock);
}

export type { Citation };
