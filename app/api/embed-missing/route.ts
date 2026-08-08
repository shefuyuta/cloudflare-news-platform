// app/api/embed-missing/route.ts
// ---------------------------------------------------------------------
// Browser-triggered embedding backlog drain. Thin wrapper around the
// shared pipeline in lib/pipeline/embed-missing.ts, which is also called
// directly (looped) by the cron scheduled handler (worker.ts). Embeds
// articles that are in D1 but not yet in Vectorize.
// ---------------------------------------------------------------------

import { NextResponse } from "next/server";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { runEmbedMissing } from "@/lib/pipeline/embed-missing";
import type { Env } from "@/lib/types";

export async function POST(): Promise<Response> {
  const env = (await getCloudflareContext()).env as unknown as Env;
  const result = await runEmbedMissing(env);
  return NextResponse.json(result);
}
