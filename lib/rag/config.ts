// lib/rag/config.ts
// ---------------------------------------------------------------------
// SINGLE SOURCE OF TRUTH for AI bot / RAG behavior.
//
// Code-side defaults below. Anything in the D1 `rag_config` table will
// OVERRIDE these at runtime (see loadRuntimeConfig() in chat.ts), so
// you can A/B test models or tune top_k without redeploying.
// ---------------------------------------------------------------------

import type { Env } from "../types";

export interface RagConfig {
  /** Embedding model — must match the dimension of your Vectorize index. */
  embeddingModel: keyof AiModels;
  /** Chat model. */
  llmModel: keyof AiModels;
  /** How many vectors to retrieve before re-ranking / filtering. */
  topK: number;
  /** Drop retrieved chunks below this cosine score. */
  minScore: number;
  /** LLM sampling. */
  temperature: number;
  maxTokens: number;
  /** Max characters of retrieved content per source pasted into the prompt. */
  contextCharsPerSource: number;
  /** System prompt template. {{date}} and {{context}} are substituted. */
  systemPrompt: string;
}

/** Workers AI model strings — tweak freely. The two embedding options here
 *  have known dimensions: bge-base-en-v1.5 → 768, bge-large-en-v1.5 → 1024.
 *  Make sure your Vectorize index dimensions match. */
type AiModels = {
  "@cf/baai/bge-base-en-v1.5": unknown;
  "@cf/baai/bge-large-en-v1.5": unknown;
  "@cf/meta/llama-3.1-8b-instruct": unknown;
  "@cf/meta/llama-3.3-70b-instruct-fp8-fast": unknown;
  "@cf/mistral/mistral-7b-instruct-v0.2": unknown;
};

export const DEFAULTS: RagConfig = {
  embeddingModel: "@cf/baai/bge-base-en-v1.5",
  llmModel:       "@cf/meta/llama-3.1-8b-instruct",
  topK:           6,
  minScore:       0.55,
  temperature:    0.3,
  maxTokens:      768,
  contextCharsPerSource: 1200,

  systemPrompt: `You are NewsHub's analyst assistant. Today is {{date}}.

Answer the user's question using ONLY the news excerpts in <sources>. Rules:
- If the sources do not contain the answer, say so plainly. Do not invent facts.
- Cite each claim with [n] referring to the source number in <sources>.
- Prefer the most recent source when sources disagree, and note the disagreement.
- Be concise. Lead with the answer, then 2–4 supporting bullets, then the citations list.
- Match the user's language (Japanese or English).

<sources>
{{context}}
</sources>`,
};

/** Merge D1 overrides on top of DEFAULTS. Safe if the table is missing. */
export async function loadRuntimeConfig(env: Env): Promise<RagConfig> {
  try {
    const res = await env.DB.prepare("SELECT key, value FROM rag_config").all();
    const map = new Map<string, string>();
    for (const r of res.results ?? []) {
      map.set((r as { key: string }).key, (r as { value: string }).value);
    }
    return {
      ...DEFAULTS,
      embeddingModel:        (map.get("embedding_model") ?? DEFAULTS.embeddingModel) as RagConfig["embeddingModel"],
      llmModel:              (map.get("llm_model")       ?? DEFAULTS.llmModel)       as RagConfig["llmModel"],
      topK:                  num(map.get("top_k"),                 DEFAULTS.topK),
      minScore:              num(map.get("min_score"),             DEFAULTS.minScore),
      temperature:           num(map.get("temperature"),           DEFAULTS.temperature),
      maxTokens:             num(map.get("max_tokens"),            DEFAULTS.maxTokens),
      contextCharsPerSource: num(map.get("context_chars_per_source"), DEFAULTS.contextCharsPerSource),
      systemPrompt:          map.get("system_prompt") ?? DEFAULTS.systemPrompt,
    };
  } catch {
    return DEFAULTS;
  }
}

function num(v: string | undefined, fallback: number): number {
  const n = v ? Number(v) : NaN;
  return Number.isFinite(n) ? n : fallback;
}
