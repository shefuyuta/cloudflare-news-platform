// app/ransomware/page.tsx
import { Suspense } from "react";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { groupDisplayName, fmtDate, type VictimWithNews } from "@/lib/ransomware";
import { RansomwareClient } from "@/components/ransomware/RansomwareClient";
import type { Env } from "@/lib/types";
import { cookies } from "next/headers";
import { type Lang, DEFAULT_LANG, LANG_COOKIE } from "@/lib/i18n";
export const dynamic = "force-dynamic";

export default async function RansomwarePage({ searchParams }: {
  searchParams: Promise<{ group?: string }>;
}) {
  const sp   = await searchParams;
  const env  = (await getCloudflareContext()).env as unknown as Env;
  const cookieStore = await cookies();
  const lang = (cookieStore.get(LANG_COOKIE)?.value as Lang) ?? DEFAULT_LANG;

  // ── Fetch victims from D1 cache ─────────────────────────────────────
  const victimRows = sp.group
    ? await env.DB.prepare(`
        SELECT id, victim, group_name, activity, website, description, post_url, discovered, published
        FROM ransomware_victims
        WHERE country IN ('JP', 'Japan', '日本')
          AND LOWER(group_name) = LOWER(?)
        ORDER BY discovered DESC, published DESC LIMIT 200
      `).bind(sp.group).all()
    : await env.DB.prepare(`
        SELECT id, victim, group_name, activity, website, description, post_url, discovered, published
        FROM ransomware_victims
        WHERE country IN ('JP', 'Japan', '日本')
        ORDER BY discovered DESC, published DESC LIMIT 200
      `).all();

  const rawVictims = (victimRows.results ?? []) as {
    id: number; victim: string; group_name: string; activity: string;
    website: string; description: string; post_url: string;
    discovered: string; published: string;
  }[];

  // ── Find related news ────────────────────────────────────────────────
  // Instead of N parallel D1 queries (one per victim), do ONE batch query
  // searching for all victim/group names combined, then match client-side.
  const newsMap = new Map<number, { id: string; title: string; url: string; source: string; publishedAt: string }[]>();

  if (rawVictims.length > 0) {
    // Build a combined search across the most prominent victims (limit to 50)
    const topVictims = rawVictims.slice(0, 50);
    const nameTokens = [...new Set(
      topVictims.flatMap(v => [v.victim, v.group_name].filter(Boolean).map(s => s.trim()))
    )].slice(0, 20); // limit OR terms

    if (nameTokens.length > 0) {
      // Search for each term that's long enough to be meaningful
      const meaningfulTerms = nameTokens.filter(t => t.length >= 3);

      for (const term of meaningfulTerms.slice(0, 10)) {
        const rows = await env.DB.prepare(
          `SELECT id, title, url, source, published_at
           FROM articles
           WHERE (title LIKE ? OR content LIKE ? OR summary LIKE ?)
             AND published_at >= datetime('now', '-60 days')
           ORDER BY importance_score DESC, published_at DESC
           LIMIT 5`
        ).bind(`%${term}%`, `%${term}%`, `%${term}%`).all();

        for (const row of rows.results ?? []) {
          const r = row as { id: string; title: string; url: string; source: string; published_at: string };
          // Associate with matching victims
          for (const v of topVictims) {
            const haystack = `${v.victim} ${v.group_name}`.toLowerCase();
            if (haystack.includes(term.toLowerCase())) {
              const existing = newsMap.get(v.id) ?? [];
              if (!existing.find(n => n.id === r.id) && existing.length < 3) {
                existing.push({ id: r.id, title: r.title, url: r.url, source: r.source, publishedAt: r.published_at ?? "" });
                newsMap.set(v.id, existing);
              }
            }
          }
        }
      }
    }
  }

  // ── Build final victim list ──────────────────────────────────────────
  const victims: VictimWithNews[] = rawVictims.map(v => ({
    id:           v.id,
    victim:       v.victim,
    group:        v.group_name,
    groupDisplay: groupDisplayName(v.group_name),
    activity:     v.activity,
    website:      v.website,
    description:  v.description,
    post_url:     v.post_url,
    discovered:   v.discovered,
    discoveredFmt: fmtDate(v.discovered || v.published, lang),
    relatedNews:  newsMap.get(v.id) ?? [],
  }));

  const groupSet = new Set(rawVictims.map(v => v.group_name).filter(Boolean));
  const groups   = [...groupSet].sort();

  return (
    <Suspense fallback={
      <div className="py-20 text-center text-sm text-[var(--ink-3)]">
        読み込み中… / Loading…
      </div>
    }>
      <RansomwareClient
        victims={victims}
        groups={groups}
        totalCount={victims.length}
        latestDate={victims[0]?.discovered ?? ""}
        hasCache={victims.length > 0}
        lang={lang}
        selectedGroup={sp.group ?? ""}
      />
    </Suspense>
  );
}
