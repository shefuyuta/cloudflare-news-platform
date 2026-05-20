// app/api/slack-briefing/route.ts
// Sends a news briefing to a Slack webhook or email (via MailChannels on Cloudflare).
// POST body: { webhookUrl?: string, email?: string, lang?: "ja"|"en" }
import { NextResponse } from "next/server";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import type { Env } from "@/lib/types";

export async function POST(req: Request): Promise<Response> {
  const env = (await getCloudflareContext()).env as unknown as Env;
  const body = (await req.json().catch(() => ({}))) as {
    webhookUrl?: string;
    email?: string;
    lang?: string;
  };

  const lang = body.lang ?? "ja";

  // Generate briefing
  const rows = await env.DB.prepare(
    `SELECT title, source, category, url, COALESCE(importance_score, 0) as score
     FROM articles
     WHERE published_at >= datetime('now','-24 hours')
     ORDER BY score DESC, published_at DESC
     LIMIT 10`
  ).all();

  const articles = (rows.results ?? []) as {
    title: string;
    source: string;
    category: string;
    url: string;
    score: number;
  }[];

  if (!articles.length) {
    return NextResponse.json({ error: "no articles" }, { status: 400 });
  }

  // AI briefing
  const articleList = articles
    .map((a) => `[${a.category.toUpperCase()}] ${a.title} (${a.source})`)
    .join("\n");

  const prompt =
    lang === "ja"
      ? `以下のニュース記事から、3〜5文の日本語ブリーフィングを生成してください。\n\n${articleList}\n\nブリーフィング：`
      : `Write a 3-5 sentence briefing in English from these news articles:\n\n${articleList}\n\nBriefing:`;

  const ai = env.AI as {
    run: (model: string, opts: object) => Promise<{ response: string }>;
  };
  const aiResp = await ai.run("@cf/meta/llama-3.1-8b-instruct", {
    messages: [{ role: "user", content: prompt }],
    max_tokens: 300,
  });
  const briefingText = aiResp?.response?.trim() ?? "";

  const date = new Date().toLocaleDateString(lang === "ja" ? "ja-JP" : "en-US", {
    year: "numeric", month: "long", day: "numeric",
  });

  // ── Slack ────────────────────────────────────────────────────────────
  if (body.webhookUrl) {
    const blocks = [
      {
        type: "header",
        text: { type: "plain_text", text: lang === "ja" ? `📰 NewsHub 本日のブリーフィング — ${date}` : `📰 NewsHub Daily Briefing — ${date}` },
      },
      { type: "section", text: { type: "mrkdwn", text: briefingText } },
      { type: "divider" },
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text:
            (lang === "ja" ? "*本日のトップ記事:*\n" : "*Top articles today:*\n") +
            articles
              .slice(0, 5)
              .map((a) => `• <${a.url}|${a.title}> — ${a.source}`)
              .join("\n"),
        },
      },
    ];

    const slackResp = await fetch(body.webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ blocks }),
    });

    if (!slackResp.ok) {
      return NextResponse.json({ error: "Slack delivery failed" }, { status: 502 });
    }
    return NextResponse.json({ ok: true, channel: "slack" });
  }

  // ── Email via MailChannels ────────────────────────────────────────────
  if (body.email) {
    const htmlBody = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><style>
  body { font-family: -apple-system, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; color: #0a0a0a; }
  h1 { font-size: 20px; border-bottom: 1px solid #e4e4e7; padding-bottom: 12px; }
  .briefing { background: #fafaf9; border-left: 3px solid #0a0a0a; padding: 12px 16px; margin: 16px 0; line-height: 1.6; }
  .article { margin: 8px 0; }
  a { color: #1e3a8a; }
  .badge { display: inline-block; padding: 2px 8px; border-radius: 999px; font-size: 11px; font-weight: 500; background: #e4e4e7; }
</style></head>
<body>
<h1>📰 shefutech NewsHub — ${date}</h1>
<div class="briefing">${briefingText.replace(/\n/g, "<br>")}</div>
<h2 style="font-size:14px;margin-top:24px;">${lang === "ja" ? "本日のトップ記事" : "Top Articles Today"}</h2>
${articles
  .slice(0, 8)
  .map(
    (a) =>
      `<div class="article"><span class="badge">${a.category}</span> <a href="${a.url}">${a.title}</a> <span style="color:#71717a">— ${a.source}</span></div>`
  )
  .join("")}
<p style="color:#71717a;font-size:11px;margin-top:32px;">shefutech NewsHub · AI-augmented news desk powered by Cloudflare</p>
</body></html>`;

    const emailResp = await fetch("https://api.mailchannels.net/tx/v1/send", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        personalizations: [{ to: [{ email: body.email }] }],
        from: { email: "briefing@news.shefutech.com", name: "shefutech NewsHub" },
        subject: lang === "ja" ? `NewsHub 本日のブリーフィング — ${date}` : `NewsHub Daily Briefing — ${date}`,
        content: [{ type: "text/html", value: htmlBody }],
      }),
    });

    if (!emailResp.ok) {
      return NextResponse.json({ error: "Email delivery failed" }, { status: 502 });
    }
    return NextResponse.json({ ok: true, channel: "email" });
  }

  return NextResponse.json({ error: "No delivery target (webhookUrl or email required)" }, { status: 400 });
}
