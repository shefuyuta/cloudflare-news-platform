// app/api/related/route.ts
// Returns the related (same-story) articles for a given article ID, in
// both directions of the one-directional related_articles table. Used by
// NewsCard's "Related articles (N)" expander — the count is fetched in
// bulk by listArticles, but the actual titles/URLs are loaded on demand
// here so the list query stays light.
import { getCloudflareContext } from "@opennextjs/cloudflare";
import type { Env } from "@/lib/types";

export async function GET(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const articleId = url.searchParams.get("id");
  if (!articleId) {
    return Response.json({ error: "missing id" }, { status: 400 });
  }

  const env = (await getCloudflareContext()).env as unknown as Env;

  const rows = await env.DB.prepare(`
    SELECT a.id, a.title, a.source, a.url, a.published_at, r.score
    FROM (
      SELECT related_id AS id, score FROM related_articles WHERE article_id = ?
      UNION ALL
      SELECT article_id AS id, score FROM related_articles WHERE related_id = ?
    ) r
    JOIN articles a ON a.id = r.id
    ORDER BY r.score DESC
    LIMIT 8
  `).bind(articleId, articleId).all();

  const related = (rows.results ?? []).map(row => {
    const r = row as { id: string; title: string; source: string; url: string; published_at: string; score: number };
    return { id: r.id, title: r.title, source: r.source, url: r.url, publishedAt: r.published_at, score: r.score };
  });

  return Response.json({ related });
}
