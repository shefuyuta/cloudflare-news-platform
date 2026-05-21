// app/api/articles/route.ts
import { NextResponse } from "next/server";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { listArticles } from "@/lib/db";
import type { Env, ArticleQuery } from "@/lib/types";
import type { Category } from "@/lib/categories";

export async function GET(req: Request): Promise<Response> {
  const env = (await getCloudflareContext()).env as unknown as Env;
  const { searchParams } = new URL(req.url);

  const q: ArticleQuery = {
    category:     (searchParams.get("category") as Category) ?? undefined,
    region:       searchParams.get("region")      ?? undefined,
    subcategory:  searchParams.get("subcategory") ?? undefined,
    tags:         searchParams.getAll("tag"),
    source:       searchParams.get("source")      ?? undefined,
    q:            searchParams.get("q")           ?? undefined,
    important:    searchParams.get("important") === "1",
    hoursAgo:     clampInt(searchParams.get("hours"), 24, 1, 168),
    noTimeLimit:  searchParams.get("all") === "1",
    minScore:     searchParams.get("minScore") ? parseInt(searchParams.get("minScore")!, 10) : undefined,
    maxScore:     searchParams.get("maxScore") ? parseInt(searchParams.get("maxScore")!, 10) : undefined,
    limit:        clampInt(searchParams.get("limit"),  50,  1, 200),
    offset:       clampInt(searchParams.get("offset"),  0,  0, 10_000),
  };

  const items = await listArticles(env, q);
  return NextResponse.json({ items, query: q });
}

function clampInt(v: string | null, fallback: number, min: number, max: number): number {
  const n = v ? parseInt(v, 10) : NaN;
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, n));
}
