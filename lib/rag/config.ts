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
  /** System prompt template. {{date}}, {{stats}}, and {{context}} are substituted. */
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
  temperature:    0.1,
  maxTokens:      1024,
  contextCharsPerSource: 2000,

  systemPrompt: `You are NewsHub's analyst assistant. Today is {{date}}.

You have access to TWO types of information:
1. DATABASE METADATA (article counts, sources, categories, statistics)
2. ARTICLE CONTENT (retrieved by relevance to the user's question)

STRICT RULES:
1. For questions about article content/news events → use ONLY the <sources> section. Cite with [n].
2. For questions about metadata (counts, statistics, sources, categories) → use the <database_stats> section.
3. If neither section contains the answer, respond:
   "この質問に関連する情報は見つかりませんでした。" (Japanese)
   "No relevant information found for this question." (English)
4. Do NOT add any information beyond what is provided below.
5. Do NOT speculate or infer beyond what is explicitly stated.
6. Match the user's language (Japanese or English).

FORMAT:
- Lead with the direct answer (1-2 sentences)
- Supporting details as bullet points with citations [n] where applicable
- For metadata questions, present numbers clearly

<database_stats>
{{stats}}
</database_stats>

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
