// app/api/export/route.ts
// Exports articles as CSV. PDF is generated client-side from CSV data.
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { listArticles, getArticlesByIds } from "@/lib/db";
import type { Env, ArticleQuery } from "@/lib/types";
import type { Category } from "@/lib/categories";

export async function GET(req: Request): Promise<Response> {
  const env = (await getCloudflareContext()).env as unknown as Env;
  const { searchParams } = new URL(req.url);

  // When the caller passes an explicit id list (e.g. the search page, whose
  // results come from semantic/vector search and can't be reproduced by a
  // SQL LIKE on `q`), export exactly those articles in the given order.
  // Otherwise fall back to the query-based listing used by the desk pages.
  const idList = searchParams.getAll("id");

  let articles;
  if (idList.length) {
    const byId = await getArticlesByIds(env, idList);
    // getArticlesByIds uses IN(...) so order isn't preserved — restore the
    // caller's order (search relevance) via an index map.
    const rank = new Map(idList.map((id, i) => [id, i]));
    articles = byId.sort((a, b) => (rank.get(a.id) ?? 0) - (rank.get(b.id) ?? 0));
  } else {
    const q: ArticleQuery = {
      category: (searchParams.get("category") as Category) ?? undefined,
      region: searchParams.get("region") ?? undefined,
      subcategory: searchParams.get("subcategory") ?? undefined,
      tags: searchParams.getAll("tag"),
      q: searchParams.get("q") ?? undefined,
      hoursAgo: parseInt(searchParams.get("hours") ?? "24", 10),
      limit: 500,
    };
    articles = await listArticles(env, q);
  }

  // Build CSV
  const header = ["ID", "Title", "Category", "Subcategory", "Region", "Source", "Tags", "PublishedAt", "URL"];
  const rows = articles.map((a) => [
    a.id,
    csvEscape(a.title),
    a.category,
    a.subcategory ?? "",
    a.region ?? "",
    csvEscape(a.source),
    csvEscape(a.tags.join("; ")),
    a.publishedAt,
    a.url,
  ]);

  const csv = [header, ...rows].map((r) => r.join(",")).join("\n");
  const now = new Date().toISOString().slice(0, 10);

  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="newshub-${now}.csv"`,
    },
  });
}

function csvEscape(val: string): string {
  if (!val) return "";
  if (val.includes(",") || val.includes('"') || val.includes("\n")) {
    return `"${val.replace(/"/g, '""')}"`;
  }
  return val;
}
