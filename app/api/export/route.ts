// app/api/export/route.ts
// Exports articles as CSV. PDF is generated client-side from CSV data.
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { listArticles } from "@/lib/db";
import type { Env, ArticleQuery } from "@/lib/types";
import type { Category } from "@/lib/categories";

export async function GET(req: Request): Promise<Response> {
  const env = (await getCloudflareContext()).env as unknown as Env;
  const { searchParams } = new URL(req.url);

  const q: ArticleQuery = {
    category: (searchParams.get("category") as Category) ?? undefined,
    region: searchParams.get("region") ?? undefined,
    subcategory: searchParams.get("subcategory") ?? undefined,
    tags: searchParams.getAll("tag"),
    q: searchParams.get("q") ?? undefined,
    hoursAgo: parseInt(searchParams.get("hours") ?? "24", 10),
    limit: 500,
  };

  const articles = await listArticles(env, q);

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
