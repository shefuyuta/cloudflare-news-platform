// app/api/ransomware-fetch/route.ts
// Fetches recent victims from ransomware.live, filters for Japan,
// and upserts into the local D1 cache table.
// Called by the Cron fetcher and manually via the page refresh button.
import { NextResponse } from "next/server";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { fetchRecentVictims, fetchVictimsByMonth, isJapan } from "@/lib/ransomware";
import type { RansomwareVictim } from "@/lib/ransomware";
import type { Env } from "@/lib/types";

export async function POST(req: Request): Promise<Response> {
  const env = (await getCloudflareContext()).env as unknown as Env;
  const { months = 3 } = await req.json().catch(() => ({})) as { months?: number };

  const now   = new Date();
  const toFetch: { year: number; month: number }[] = [];

  // Always include recent victims endpoint
  let allVictims: RansomwareVictim[] = await fetchRecentVictims().catch((): RansomwareVictim[] => []);

  // Also backfill up to `months` calendar months
  for (let i = 0; i < Math.min(months, 6); i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    toFetch.push({ year: d.getFullYear(), month: d.getMonth() + 1 });
  }

  for (const { year, month } of toFetch) {
    const monthly: RansomwareVictim[] = await fetchVictimsByMonth(year, month).catch((): RansomwareVictim[] => []);
    allVictims = allVictims.concat(monthly);
  }

  // Deduplicate by id
  const seen  = new Set<number>();
  const japan = allVictims.filter(v => {
    if (seen.has(v.id)) return false;
    seen.add(v.id);
    return isJapan(v.country);
  });

  const fetchedAt = now.toISOString();
  let upserted = 0;

  for (const v of japan) {
    await env.DB.prepare(`
      INSERT INTO ransomware_victims
        (id, victim, group_name, country, activity, website, description, post_url, discovered, published, fetched_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        victim=excluded.victim, group_name=excluded.group_name,
        description=excluded.description, fetched_at=excluded.fetched_at
    `).bind(
      v.id, v.victim ?? "", v.group ?? "", v.country ?? "JP",
      v.activity ?? "", v.website ?? "", v.description ?? "",
      v.post_url ?? "", v.discovered ?? "", v.published ?? "",
      fetchedAt,
    ).run();
    upserted++;
  }

  return NextResponse.json({ upserted, total: japan.length, scanned: allVictims.length });
}
