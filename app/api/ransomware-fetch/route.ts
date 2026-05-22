// app/api/ransomware-fetch/route.ts
import { NextResponse } from "next/server";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import {
  fetchRecentVictims, fetchVictimsByMonth, isJapan, extractUid,
} from "@/lib/ransomware";
import type { RansomwareVictim } from "@/lib/ransomware";
import type { Env } from "@/lib/types";

export async function POST(req: Request): Promise<Response> {
  const env = (await getCloudflareContext()).env as unknown as Env;
  const { months = 3 } = await req.json().catch(() => ({})) as { months?: number };

  const now     = new Date();
  const errors: string[] = [];

  // Collect from /recentvictims
  let allVictims: RansomwareVictim[] = [];
  try {
    allVictims = await fetchRecentVictims();
  } catch (e) {
    errors.push(`recentvictims: ${e}`);
  }

  // Backfill monthly
  for (let i = 0; i < Math.min(months, 6); i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    try {
      const monthly = await fetchVictimsByMonth(d.getFullYear(), d.getMonth() + 1);
      allVictims = allVictims.concat(monthly);
    } catch (e) {
      errors.push(`monthly ${d.getFullYear()}/${d.getMonth() + 1}: ${e}`);
    }
  }

  // Deduplicate by post_url (the real unique key)
  const seen  = new Set<string>();
  const japan = allVictims.filter(v => {
    const uid = extractUid(v.post_url);
    if (!uid || seen.has(uid)) return false;
    seen.add(uid);
    return isJapan(v.country);
  });

  const fetchedAt = now.toISOString();
  let upserted = 0;

  for (const v of japan) {
    const uid = extractUid(v.post_url);
    try {
      await env.DB.prepare(`
        INSERT INTO ransomware_victims
          (id, victim, group_name, country, activity, website,
           description, post_url, discovered, published, fetched_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          victim=excluded.victim,
          group_name=excluded.group_name,
          country=excluded.country,
          description=excluded.description,
          fetched_at=excluded.fetched_at
      `).bind(
        uid,
        v.post_title  ?? "",
        v.group_name  ?? "",
        v.country     ?? "JP",
        v.activity    ?? "",
        v.website     ?? "",
        v.description ?? "",
        v.post_url    ?? "",
        v.discovered  ?? "",
        v.published   ?? "",
        fetchedAt,
      ).run();
      upserted++;
    } catch (e) {
      errors.push(`upsert ${uid}: ${e}`);
    }
  }

  return NextResponse.json({
    upserted,
    total_japan: japan.length,
    scanned: allVictims.length,
    errors: errors.length ? errors.slice(0, 5) : undefined,
  });
}
