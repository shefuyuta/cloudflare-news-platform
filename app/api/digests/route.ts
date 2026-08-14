// app/api/digests/route.ts
// Returns the latest digest of each type (daily/weekly/monthly), plus a
// short history list per type for the archive view.
import { getCloudflareContext } from "@opennextjs/cloudflare";
import type { Env } from "@/lib/types";

interface DigestRow {
  id: string;
  type: string;
  period_start: string;
  period_end: string;
  content: string;   // JSON {"ja":"...","en":"..."}
  generated_at: string;
}

export async function GET(): Promise<Response> {
  const env = (await getCloudflareContext()).env as unknown as Env;

  const rows = await env.DB.prepare(`
    SELECT id, type, period_start, period_end, content, generated_at
    FROM digests
    ORDER BY period_end DESC, generated_at DESC
    LIMIT 60
  `).all();

  const all = (rows.results ?? []).map(r => {
    const row = r as unknown as DigestRow;
    let content: { ja: string; en: string };
    try { content = JSON.parse(row.content); } catch { content = { ja: "", en: "" }; }
    return {
      id: row.id,
      type: row.type,
      periodStart: row.period_start,
      periodEnd: row.period_end,
      contentJa: content.ja,
      contentEn: content.en,
      generatedAt: row.generated_at,
    };
  });

  const byType = (t: string) => all.filter(d => d.type === t);

  return Response.json({
    latest: {
      daily:   byType("daily")[0]   ?? null,
      weekly:  byType("weekly")[0]  ?? null,
      monthly: byType("monthly")[0] ?? null,
    },
    history: {
      daily:   byType("daily").slice(0, 14),
      weekly:  byType("weekly").slice(0, 8),
      monthly: byType("monthly").slice(0, 6),
    },
  });
}
