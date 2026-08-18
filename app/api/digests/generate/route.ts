// app/api/digests/generate/route.ts
// Manual trigger for digest generation, mainly for testing/debugging the
// cron-driven flow without waiting for 9am JST. POST { type: "daily" |
// "weekly" | "monthly" } with an Authorization: Bearer <ADMIN_TOKEN> header.
// Returns the generated digest AND surfaces any LLM/summarization error
// explicitly (the normal cron path swallows it and falls back silently),
// so failures are visible when testing by hand.
//
// This endpoint calls an LLM and writes to D1 on every request, so it's
// gated behind a secret token rather than left open — set it with:
//   npx wrangler secret put ADMIN_TOKEN
// then pass it as: -H "Authorization: Bearer <token>"
import { getCloudflareContext } from "@opennextjs/cloudflare";
import type { Env } from "@/lib/types";
import { generateDigest, type DigestType } from "@/lib/digest/generate";

export async function POST(req: Request): Promise<Response> {
  const env = (await getCloudflareContext()).env as unknown as Env;

  // If ADMIN_TOKEN isn't configured, refuse everything rather than running
  // unauthenticated — a missing secret should fail closed, not open.
  if (!env.ADMIN_TOKEN) {
    return Response.json({ error: "admin endpoint not configured" }, { status: 503 });
  }
  const authHeader = req.headers.get("authorization") ?? "";
  const provided = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
  if (provided !== env.ADMIN_TOKEN) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }

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

  try {
    const digest = await generateDigest(env, type);
    return Response.json({ ok: true, digest });
  } catch (e) {
    return Response.json({ ok: false, error: String(e) }, { status: 500 });
  }
}
