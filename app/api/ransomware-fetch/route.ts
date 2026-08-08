// app/api/ransomware-fetch/route.ts
// ---------------------------------------------------------------------
// Browser-triggered ransomware victim fetch. Thin wrapper around the
// shared pipeline in lib/pipeline/ransomware-fetch.ts, which is also
// called directly by the cron scheduled handler (worker.ts).
// ---------------------------------------------------------------------

import { NextResponse } from "next/server";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { runRansomwareFetch } from "@/lib/pipeline/ransomware-fetch";
import type { Env } from "@/lib/types";

export async function POST(req: Request): Promise<Response> {
  const env = (await getCloudflareContext()).env as unknown as Env;
  const { months = 6 } = await req.json().catch(() => ({})) as { months?: number };
  const result = await runRansomwareFetch(env, months);
  return NextResponse.json(result);
}
