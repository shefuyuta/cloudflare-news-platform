// app/api/ransomware-debug/route.ts
// Diagnostic endpoint — shows raw API response without filtering or DB writes.
// GET /api/ransomware-debug   → shows first 5 raw victims + Japan count + DB row count
import { NextResponse } from "next/server";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import type { Env } from "@/lib/types";

export async function GET(): Promise<Response> {
  const env = (await getCloudflareContext()).env as unknown as Env;
  const result: Record<string, unknown> = {};

  // 1. Fetch raw from /recentvictims
  try {
    const res = await fetch("https://api.ransomware.live/recentvictims", {
      headers: { "User-Agent": "shefutech-newshub-debug/1.0" },
    });
    result.api_status = res.status;
    result.api_ok     = res.ok;

    if (res.ok) {
      const data = await res.json() as Record<string, unknown>[];
      result.total_recent   = data.length;
      result.first_3_raw    = data.slice(0, 3); // show raw fields
      // Count Japan by various possible field values
      result.japan_by_JP     = data.filter(v => v.country === "JP").length;
      result.japan_by_Japan  = data.filter(v => v.country === "Japan").length;
      result.japan_by_japan  = data.filter(v => (v.country as string)?.toLowerCase() === "japan").length;
      result.unique_countries = [...new Set(data.map(v => v.country))].slice(0, 20);
    } else {
      result.api_error = await res.text().catch(() => "unreadable");
    }
  } catch (e) {
    result.fetch_exception = String(e);
  }

  // 2. Check DB table exists and row count
  try {
    const countRow = await env.DB.prepare(
      "SELECT COUNT(*) as cnt FROM ransomware_victims"
    ).first() as { cnt: number } | null;
    result.db_row_count = countRow?.cnt ?? 0;

    const sample = await env.DB.prepare(
      "SELECT id, victim, country, group_name, discovered FROM ransomware_victims LIMIT 3"
    ).all();
    result.db_sample = sample.results;
  } catch (e) {
    result.db_error = String(e);
  }

  // 3. Try one monthly fetch
  const now = new Date();
  try {
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, "0");
    const res2 = await fetch(`https://api.ransomware.live/victims/${y}/${m}`, {
      headers: { "User-Agent": "shefutech-newshub-debug/1.0" },
    });
    result.monthly_status = res2.status;
    if (res2.ok) {
      const d2 = await res2.json() as Record<string, unknown>[];
      result.monthly_total = d2.length;
      result.monthly_japan = d2.filter(v =>
        (v.country as string)?.toLowerCase().includes("jap") || v.country === "JP"
      ).length;
    }
  } catch (e) {
    result.monthly_exception = String(e);
  }

  return NextResponse.json(result, {
    headers: { "Content-Type": "application/json" },
  });
}
