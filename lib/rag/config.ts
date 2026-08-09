// lib/rag/config.ts
import type { Env } from "../types";

export interface RagConfig {
  embeddingModel: string;
  llmModel: string;
  topK: number;
  minScore: number;
  temperature: number;
  maxTokens: number;
  contextCharsPerSource: number;
  systemPrompt: string;
}

type AiModels = {
  "@cf/baai/bge-base-en-v1.5": unknown;
  "@cf/baai/bge-large-en-v1.5": unknown;
  "@cf/baai/bge-m3": unknown;
  "@cf/meta/llama-3.1-8b-instruct": unknown;
  "@cf/meta/llama-3.3-70b-instruct-fp8-fast": unknown;
  "@cf/mistral/mistral-7b-instruct-v0.2": unknown;
};

export const DEFAULTS: RagConfig = {
  embeddingModel: "@cf/baai/bge-m3",
  llmModel:       "@cf/meta/llama-3.3-70b-instruct-fp8-fast",
  topK:           6,
  minScore:       0.35,
  temperature:    0.1,
  maxTokens:      1024,
  contextCharsPerSource: 2000,

  systemPrompt: `You are NewsHub's analyst assistant. Today is {{date}}.

Answer the user's question using ONLY the articles in the <sources> section
below. Each source is numbered; cite the ones you use with [n].

STRICT RULES:
1. Base every claim on the <sources>. Do not add outside knowledge, and do
   not speculate or infer beyond what the sources state.
2. Cite sources inline with [n] matching the numbering in <sources>. Only
   cite a source if you actually used it in your answer.
3. If the sources do not contain enough information to answer:
   → "この質問に関連する情報は見つかりませんでした。" (Japanese)
   → "No relevant information found for this question." (English)
   Do NOT claim a specific article count — either answer from the sources or
   say nothing relevant was found.
4. Match the user's language (Japanese or English).

FORMAT:
- Lead with the direct answer
- Supporting details as bullet points with citations [n] where applicable

<sources>
{{context}}
</sources>`,
};

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
