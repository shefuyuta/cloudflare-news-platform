// app/api/articles/route.ts
import { NextResponse } from "next/server";
import { getRequestContext } from "@cloudflare/next-on-pages";
import { listArticles } from "@/lib/db";
import type { Env, ArticleQuery } from "@/lib/types";
import type { Category } from "@/lib/categories";

export const runtime = "edge";

export async function GET(req: Request): Promise<Response> {
  const env = getRequestContext().env as unknown as Env;
  const { searchParams } = new URL(req.url);

  const q: ArticleQuery = {
    category:    (searchParams.get("category") as Category) ?? undefined,
    region:      searchParams.get("region")      ?? undefined,
    subcategory: searchParams.get("subcategory") ?? undefined,
    tags:        searchParams.getAll("tag"),
    q:           searchParams.get("q") ?? undefined,
    important:   searchParams.get("important") === "1",
    limit:       clampInt(searchParams.get("limit"),  50,  1, 200),
    offset:      clampInt(searchParams.get("offset"),  0,  0, 10_000),
  };

  const items = await listArticles(env, q);
  return NextResponse.json({ items, query: q });
}

function clampInt(v: string | null, fallback: number, min: number, max: number): number {
  const n = v ? parseInt(v, 10) : NaN;
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, n));
}
