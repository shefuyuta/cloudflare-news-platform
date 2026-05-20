// app/api/cleanup/route.ts
// Deletes articles older than KEEP_HOURS from D1 and their vectors from Vectorize.
// Called by the workers fetcher Cron after each fetch cycle.
// Safe to call multiple times; idempotent.
import { NextResponse } from "next/server";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import type { Env } from "@/lib/types";

// Keep articles for the longest display window (1 week) plus a 1-day buffer.
const KEEP_HOURS = 24 * 8; // 8 days

export async function POST(): Promise<Response> {
  const env    = (await getCloudflareContext()).env as unknown as Env;
  const cutoff = new Date(Date.now() - KEEP_HOURS * 3_600_000).toISOString();

  // 1. Collect IDs to delete (need them for Vectorize too)
  const toDelete = await env.DB.prepare(
    "SELECT id FROM articles WHERE published_at < ? LIMIT 200"
  ).bind(cutoff).all();

  const ids = (toDelete.results ?? []).map(r => (r as { id: string }).id);

  if (!ids.length) {
    return NextResponse.json({ deleted: 0, message: "Nothing to clean up." });
  }

  // 2. Delete from Vectorize (best-effort; don't fail if some IDs are missing)
  try {
    await env.VECTORIZE.deleteByIds(ids);
  } catch (e) {
    console.warn("[cleanup] Vectorize delete partial failure (non-fatal):", e);
  }

  // 3. Delete from D1 — cascades to article_tags via FK
  const ph = ids.map(() => "?").join(",");
  const r  = await env.DB.prepare(
    `DELETE FROM articles WHERE id IN (${ph})`
  ).bind(...ids).run();

  const deleted = r.meta?.changes ?? ids.length;
  console.log(`[cleanup] Deleted ${deleted} articles older than ${KEEP_HOURS}h (cutoff: ${cutoff})`);

  return NextResponse.json({ deleted, cutoff, keepHours: KEEP_HOURS });
}
