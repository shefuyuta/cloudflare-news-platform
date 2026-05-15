// lib/rag/embeddings.ts
import type { Env } from "../types";
import type { RagConfig } from "./config";

/** Embed a single string into a vector for the configured model. */
export async function embed(env: Env, text: string, cfg: RagConfig): Promise<number[]> {
  const res = await env.AI.run(cfg.embeddingModel, { text: [text] }) as
    { data: number[][] };
  if (!res?.data?.[0]) throw new Error("Embedding failed");
  return res.data[0];
}

/** Embed many strings in one call (batched). */
export async function embedBatch(env: Env, texts: string[], cfg: RagConfig): Promise<number[][]> {
  if (!texts.length) return [];
  const res = await env.AI.run(cfg.embeddingModel, { text: texts }) as
    { data: number[][] };
  return res.data ?? [];
}

/**
 * Naive chunker for article bodies — paragraph-aware, ~600 char chunks
 * with light overlap. Tune as needed; keep deterministic for re-indexing.
 */
export function chunk(text: string, target = 600, overlap = 80): string[] {
  if (!text) return [];
  const paragraphs = text.split(/\n{2,}/).map(p => p.trim()).filter(Boolean);

  const chunks: string[] = [];
  let buf = "";
  for (const p of paragraphs) {
    if ((buf + "\n\n" + p).length > target && buf) {
      chunks.push(buf);
      buf = buf.slice(Math.max(0, buf.length - overlap)) + "\n\n" + p;
    } else {
      buf = buf ? buf + "\n\n" + p : p;
    }
  }
  if (buf) chunks.push(buf);
  return chunks;
}
