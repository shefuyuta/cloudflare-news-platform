// app/api/digests/generate/route.ts
// Manual trigger for digest generation, mainly for testing/debugging the
// cron-driven flow without waiting for 9am JST. POST { type: "daily" |
// "weekly" | "monthly" }. Returns the generated digest AND surfaces any
// LLM/summarization error explicitly (the normal cron path swallows it and
// falls back silently), so failures are visible when testing by hand.
import { getCloudflareContext } from "@opennextjs/cloudflare";
import type { Env } from "@/lib/types";
import { generateDigest, type DigestType } from "@/lib/digest/generate";

export async function POST(req: Request): Promise<Response> {
  let body: { type?: string };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "invalid JSON body" }, { status: 400 });
  }

  const type = body.type as DigestType;
  if (!["daily", "weekly", "monthly"].includes(type)) {
    return Response.json({ error: "type must be 'daily', 'weekly', or 'monthly'" }, { status: 400 });
  }

  const env = (await getCloudflareContext()).env as unknown as Env;

  try {
    const digest = await generateDigest(env, type);
    return Response.json({ ok: true, digest });
  } catch (e) {
    return Response.json({ ok: false, error: String(e) }, { status: 500 });
  }
}
