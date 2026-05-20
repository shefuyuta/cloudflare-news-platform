// app/api/score-articles/route.ts
// Uses Workers AI to assign importance_score (0–10) to recently ingested articles.
// Called after fetch-news to enrich articles with AI scoring.
// Safe to call multiple times; only processes unscored articles.
import { NextResponse } from "next/server";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import type { Env } from "@/lib/types";

const BATCH = 10; // articles per AI call to stay within token limits

export async function POST(): Promise<Response> {
  const env = (await getCloudflareContext()).env as unknown as Env;

  // Fetch articles that haven't been scored yet
  const rows = await env.DB.prepare(
    `SELECT id, title, summary, category FROM articles
     WHERE importance_score IS NULL
     ORDER BY published_at DESC LIMIT ?`
  )
    .bind(BATCH)
    .all();

  const articles = (rows.results ?? []) as {
    id: string;
    title: string;
    summary?: string;
    category: string;
  }[];

  if (!articles.length) {
    return NextResponse.json({ scored: 0, remaining: 0 });
  }

  const scored: { id: string; score: number }[] = [];

  // Score in parallel (batches of 5 to avoid rate limits)
  const chunks = chunk(articles, 5);
  for (const batch of chunks) {
    await Promise.all(
      batch.map(async (a) => {
        try {
          const score = await scoreArticle(env, a);
          scored.push({ id: a.id, score });
        } catch {
          scored.push({ id: a.id, score: 5 }); // fallback to neutral
        }
      })
    );
  }

  // Bulk update scores
  for (const { id, score } of scored) {
    await env.DB.prepare("UPDATE articles SET importance_score = ? WHERE id = ?")
      .bind(score, id)
      .run();
  }

  // Count remaining unscored
  const remainingRow = await env.DB.prepare(
    "SELECT COUNT(*) as cnt FROM articles WHERE importance_score IS NULL"
  ).first();
  const remaining = (remainingRow as { cnt: number } | null)?.cnt ?? 0;

  return NextResponse.json({ scored: scored.length, remaining });
}

async function scoreArticle(
  env: Env,
  article: { id: string; title: string; summary?: string; category: string }
): Promise<number> {
  const text = [article.title, article.summary].filter(Boolean).join(" — ").slice(0, 400);

  const prompt = `You are a news editor scoring article importance from 0 to 10.
Score based on: breaking news (+3), geopolitical impact (+2), security/safety risk (+2), novelty (+1), broad audience relevance (+2).
Category: ${article.category}
Article: "${text}"
Respond with ONLY a single integer from 0 to 10. No explanation.`;

  const ai = env.AI as {
    run: (model: string, opts: object) => Promise<{ response: string }>;
  };

  const resp = await ai.run("@cf/meta/llama-3.1-8b-instruct", {
    messages: [{ role: "user", content: prompt }],
    max_tokens: 5,
  });

  const raw = resp?.response?.trim() ?? "";
  const score = parseInt(raw.match(/\d+/)?.[0] ?? "5", 10);
  return Math.max(0, Math.min(10, isNaN(score) ? 5 : score));
}

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}
