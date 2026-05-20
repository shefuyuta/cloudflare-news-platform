// lib/rag/config.ts
import type { Env } from "../types";

export interface RagConfig {
  embeddingModel: keyof AiModels;
  llmModel: keyof AiModels;
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

You have access to THREE types of information:

1. DATABASE METADATA — fixed aggregate statistics (total counts, breakdowns by category/source/region)
2. DYNAMIC KEYWORD SEARCH — actual SQL search results for keywords extracted from the user's question, including exact match counts and sample matching articles
3. ARTICLE CONTENT — full or partial text of articles retrieved by semantic relevance

STRICT RULES:
1. For "how many articles contain X?" / "○○を含む記事は何件?" questions:
   → Use the EXACT numbers from "Dynamic keyword search results" in <database_stats>.
   → Report the "In title OR summary" count as the answer.
   → List sample matches if available.
   → Do NOT guess or estimate. Use only the numbers provided.

2. For questions about aggregate stats (total articles, by category, by source):
   → Use the fixed statistics at the top of <database_stats>.

3. For questions about news content/events:
   → Use ONLY the <sources> section. Cite with [n].

4. If the information is not available in any section:
   → "この質問に関連する情報は見つかりませんでした。" (Japanese)
   → "No relevant information found for this question." (English)

5. Do NOT add information beyond what is provided below.
6. Do NOT speculate or infer beyond what is explicitly stated.
7. Match the user's language (Japanese or English).

FORMAT:
- Lead with the direct answer
- Supporting details as bullet points with citations [n] where applicable
- For count questions, always state the exact number first

<database_stats>
{{stats}}
</database_stats>

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
