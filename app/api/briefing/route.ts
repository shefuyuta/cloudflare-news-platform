// app/api/briefing/route.ts
// Generates a daily briefing using Workers AI from recent articles.
import { NextResponse } from "next/server";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import type { Env } from "@/lib/types";

export async function POST(req: Request): Promise<Response> {
  const env = (await getCloudflareContext()).env as unknown as Env;
  const { lang = "ja" } = (await req.json().catch(() => ({}))) as { lang?: string };

  // Fetch top recent articles (most recent first)
  const rows = await env.DB.prepare(
    `SELECT title, source, category, summary
     FROM articles
     WHERE published_at >= datetime('now','-24 hours')
     ORDER BY published_at DESC
     LIMIT 15`
  ).all();

  const articles = (rows.results ?? []).map((r) => {
    const row = r as { title: string; source: string; category: string; summary?: string };
    return `[${row.category.toUpperCase()}] ${row.title} (${row.source})${row.summary ? ` — ${row.summary.slice(0, 120)}` : ""}`;
  });

  if (!articles.length) {
    return NextResponse.json({ briefing: lang === "ja" ? "記事が見つかりませんでした。" : "No articles found." });
  }

  const prompt = lang === "ja"
    ? `以下は本日の主要ニュース記事です。3〜5文の簡潔な日本語ブリーフィングを書いてください。カテゴリをまたいで最も重要なポイントをまとめてください。\n\n${articles.join("\n")}\n\nブリーフィング：`
    : `Here are today's top news articles. Write a concise 3-5 sentence briefing in English summarizing the most important points across categories.\n\n${articles.join("\n")}\n\nBriefing:`;

  const aiResp = await (env.AI as { run: (model: string, opts: object) => Promise<{ response: string }> }).run(
    "@cf/meta/llama-3.1-8b-instruct",
    {
      messages: [{ role: "user", content: prompt }],
      max_tokens: 300,
    }
  );

  const briefing = aiResp?.response?.trim() ?? (lang === "ja" ? "生成に失敗しました。" : "Generation failed.");

  return NextResponse.json({ briefing });
}
