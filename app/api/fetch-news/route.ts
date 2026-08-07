// app/api/fetch-news/route.ts
// ---------------------------------------------------------------------
// Browser-triggered RSS fetch. Thin wrapper around the shared pipeline
// in lib/pipeline/fetch-news.ts, which is also called directly by the
// cron scheduled handler (worker.ts). Saves to D1 only (fast);
// embedding is handled separately by /api/embed-missing.
// ---------------------------------------------------------------------

import { NextResponse } from "next/server";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { runFetchNews } from "@/lib/pipeline/fetch-news";
import type { Env } from "@/lib/types";

export async function POST(): Promise<Response> {
  const env = (await getCloudflareContext()).env as unknown as Env;
  const result = await runFetchNews(env);
  return NextResponse.json(result);
}
