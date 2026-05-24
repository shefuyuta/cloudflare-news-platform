// app/api/generate-summaries/route.ts
// Uses Workers AI to generate concise 3-sentence Japanese+English summaries
// for articles that have scraped content but no AI-generated summary.
// Replaces the short RSS description with a proper AI summary.
import { NextResponse } from "next/server";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import type { Env } from "@/lib/types";

const BATCH   = 5;
const MAX_IN  = 1_500; // input chars sent to AI
const MAX_OUT = 200;   // max tokens for summary

export async function POST(): Promise<Response> {
  const env = (await getCloudflareContext()).env as unknown as Env;
  const ai  = env.AI as { run: (m: string, o: object) => Promise<{ response: string }> };

  // Articles with scraped content but short/missing summary
  const rows = await env.DB.prepare(`
    SELECT id, title, content, summary, category
    FROM articles
    WHERE content IS NOT NULL
      AND length(content) > 300
      AND (summary IS NULL OR length(summary) < 80)
      AND ai_summary_at IS NULL
    ORDER BY importance_score DESC, published_at DESC
    LIMIT ?
  `).bind(BATCH).all();

  const articles = (rows.results ?? []) as {
    id: string; title: string; content: string; summary?: string; category: string;
  }[];

  if (!articles.length) {
    return NextResponse.json({ generated: 0, remaining: 0 });
  }

  let generated = 0;
  const now = new Date().toISOString();

  for (const a of articles) {
    try {
      const body = a.content.slice(0, MAX_IN);
      const prompt = `以下のニュース記事を3文で要約してください。重要な事実・数字・固有名詞を含め、日本語で簡潔に。

タイトル: ${a.title}
カテゴリ: ${a.category}
本文: ${body}

要約（3文以内）:`;

      const resp = await ai.run("@cf/meta/llama-3.1-8b-instruct", {
        messages: [{ role: "user", content: prompt }],
        max_tokens: MAX_OUT,
      });

      const summary = resp?.response?.trim() ?? "";
      if (summary.length > 20) {
        await env.DB.prepare(
          "UPDATE articles SET summary = ?, ai_summary_at = ? WHERE id = ?"
        ).bind(summary, now, a.id).run();
        generated++;
      }
    } catch {
      // Non-fatal — skip this article
    }
  }

  const remaining = (await env.DB.prepare(`
    SELECT COUNT(*) as cnt FROM articles
    WHERE content IS NOT NULL AND length(content) > 300
      AND (summary IS NULL OR length(summary) < 80)
      AND ai_summary_at IS NULL
  `).first() as { cnt: number } | null)?.cnt ?? 0;

  return NextResponse.json({ generated, remaining });
}
