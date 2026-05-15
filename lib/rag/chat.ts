// lib/rag/chat.ts
import type { Env, NewsArticle, ChatRequest, Citation } from "../types";
import { loadRuntimeConfig, type RagConfig } from "./config";
import { retrieve, toCitations } from "./retriever";

/**
 * Run one chat turn:
 *   1. Load runtime config (D1 overrides + code defaults)
 *   2. Retrieve sources from Vectorize, scoped to the user's view
 *   3. Build a strict, citation-friendly prompt
 *   4. Stream the LLM response back as SSE
 *
 * Citations are emitted as a single JSON event at the start of the stream
 * so the client can render source chips alongside the message.
 */
export async function streamChat(env: Env, req: ChatRequest): Promise<Response> {
  const cfg = await loadRuntimeConfig(env);

  const hits      = await retrieve(env, req.message, req.context, cfg);
  const citations = toCitations(hits);
  const systemMsg = buildSystemPrompt(cfg, hits.map(h => ({ article: h.article, text: h.chunkText })));

  const messages: { role: "system" | "user" | "assistant"; content: string }[] = [
    { role: "system", content: systemMsg },
    ...(req.history ?? []).slice(-6),
    { role: "user", content: req.message },
  ];

  const aiStream = await env.AI.run(cfg.llmModel, {
    messages,
    stream: true,
    temperature: cfg.temperature,
    max_tokens: cfg.maxTokens,
  } as Record<string, unknown>) as unknown as ReadableStream;

  // Prepend the citations as the first SSE event, then forward the AI stream.
  const { readable, writable } = new TransformStream();
  const writer  = writable.getWriter();
  const enc     = new TextEncoder();

  await writer.write(enc.encode(sseLine("citations", citations)));
  writer.releaseLock();

  aiStream.pipeTo(writable).catch(() => { /* client likely disconnected */ });

  return new Response(readable, {
    headers: {
      "Content-Type":  "text/event-stream",
      "Cache-Control": "no-cache",
      "Connection":    "keep-alive",
    },
  });
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

function sseLine(event: string, data: unknown): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

export type { Citation };
