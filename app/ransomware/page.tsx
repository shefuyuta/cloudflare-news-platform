// app/ransomware/page.tsx
import { Suspense } from "react";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { groupDisplayName, fmtDate, type VictimWithNews } from "@/lib/ransomware";
import { RansomwareClient } from "@/components/ransomware/RansomwareClient";
import type { Env } from "@/lib/types";
import { cookies } from "next/headers";
import { type Lang, DEFAULT_LANG, LANG_COOKIE } from "@/lib/i18n";
export const dynamic = "force-dynamic";

type RawVictim = {
  id: string;
  victim: string;
  victim_ja: string | null;
  group_name: string;
  activity: string;
  website: string;
  description: string;
  post_url: string;
  discovered: string;
  published: string;
  fetched_at: string;
};

type RawNews = {
  id: string;
  title: string;
  url: string;
  source: string;
  published_at: string;
};

export default async function RansomwarePage({
  searchParams,
}: {
  searchParams: Promise<{ group?: string }>;
}) {
  const sp          = await searchParams;
  const env         = (await getCloudflareContext()).env as unknown as Env;
  const cookieStore = await cookies();
  const lang        = (cookieStore.get(LANG_COOKIE)?.value as Lang) ?? DEFAULT_LANG;

  let victims: VictimWithNews[] = [];
  let groups:  string[]          = [];
  let dbError: string | null     = null;
  let latestFetched              = "";  // Last ransomware.live sync
  let newsLastFetched            = "";  // Last RSS news fetch

  try {
    // ── Fetch victims ─────────────────────────────────────────────────
    const victimRows = sp.group
      ? await env.DB.prepare(
          `SELECT id, victim, group_name, activity, website, description,
                  post_url, discovered, published
           FROM ransomware_victims
           WHERE country IN ('JP', 'Japan', '日本')
             AND LOWER(group_name) = LOWER(?)
           ORDER BY discovered DESC, published DESC LIMIT 200`
        ).bind(sp.group).all()
      : await env.DB.prepare(
          `SELECT id, victim, group_name, activity, website, description,
                  post_url, discovered, published
           FROM ransomware_victims
           WHERE country IN ('JP', 'Japan', '日本')
           ORDER BY discovered DESC, published DESC LIMIT 200`
        ).all();

    const rawVictims = (victimRows.results ?? []) as RawVictim[];

    // ── Find related news (batched, not per-victim) ────────────────────
    const newsMap = new Map<string, VictimWithNews["relatedNews"]>();

    if (rawVictims.length > 0) {
      // Collect unique meaningful search terms from victim/group names
      // Build search terms: Japanese name → individual English words → group name
      // Word-splitting handles "Nara Medical University Hospital" → ["Nara", "Medical"] etc.
      const rawTerms: string[] = [];
      for (const v of rawVictims.slice(0, 40)) {
        // Japanese name (best match for JP news)
        if (v.victim_ja && v.victim_ja !== v.victim) rawTerms.push(v.victim_ja);
        // English: whole name for short ones, individual words for long ones
        if (v.victim) {
          if (v.victim.split(" ").length <= 3) {
            rawTerms.push(v.victim); // short name → search whole
          } else {
            // Long name → search meaningful words (skip generic words)
            const stopWords = new Set(["the","a","an","of","in","at","for","and","or","co","ltd","inc","corp","group","hospital","clinic","center","school","university"]);
            const words = v.victim.split(/\s+/)
              .filter(w => w.length >= 4 && !stopWords.has(w.toLowerCase()));
            rawTerms.push(...words.slice(0, 3));
          }
        }
        if (v.group_name) rawTerms.push(v.group_name);
      }
      const terms = [...new Set(rawTerms)].slice(0, 15); // max 15 queries

      for (const term of terms) {
        try {
          const newsRows = await env.DB.prepare(
            `SELECT id, title, url, source, published_at
             FROM articles
             WHERE (title LIKE ? OR summary LIKE ? OR content LIKE ?)
             ORDER BY published_at DESC LIMIT 3`
          ).bind(`%${term}%`, `%${term}%`, `%${term}%`).all();

          for (const row of newsRows.results ?? []) {
            const r = row as RawNews;
            // Associate with victims whose name/group contains this term
            for (const v of rawVictims.slice(0, 40)) {
              const haystack = `${v.victim} ${v.victim_ja ?? ""} ${v.group_name}`.toLowerCase();
              if (haystack.includes(term.toLowerCase())) {
                const arr = newsMap.get(v.id) ?? [];
                if (!arr.find(n => n.id === r.id) && arr.length < 3) {
                  arr.push({
                    id:          r.id,
                    title:       r.title,
                    url:         r.url,
                    source:      r.source,
                    publishedAt: r.published_at ?? "",
                  });
                  newsMap.set(String(v.id), arr);
                }
              }
            }
          }
        } catch {
          // Skip failed news lookups — non-fatal
        }
      }

      // Build final list
      victims = rawVictims.map(v => ({
        uid:          String(v.id),
        victim:       v.victim,
        victimJa:     v.victim_ja || v.victim,
        group:        v.group_name,
        groupDisplay: groupDisplayName(v.group_name),
        activity:     v.activity,
        website:      v.website,
        description:  v.description,
        post_url:     v.post_url,
        discovered:   v.discovered,
        discoveredFmt: fmtDate(v.discovered || v.published || "", lang),
        relatedNews:  newsMap.get(String(v.id)) ?? [],
      }));

      const groupSet = new Set(rawVictims.map(v => v.group_name).filter(Boolean));
      groups = [...groupSet].sort();

      // Get last fetch timestamps directly from DB (more reliable than reduce)
      const [rwTimestamp, newsTimestamp] = await Promise.all([
        env.DB.prepare("SELECT MAX(fetched_at) as ts FROM ransomware_victims").first() as Promise<{ ts: string } | null>,
        env.DB.prepare("SELECT MAX(published_at) as ts FROM articles").first() as Promise<{ ts: string } | null>,
      ]);
      latestFetched   = rwTimestamp?.ts  ?? "";
      newsLastFetched = newsTimestamp?.ts ?? "";
    }
  } catch (err) {
    // Table may not exist yet — show "run migration" message instead of crashing
    console.error("[ransomware page]", err);
    dbError = err instanceof Error ? err.message : String(err);
  }

  // ── Render ──────────────────────────────────────────────────────────
  if (dbError) {
    const needsMigration = dbError.includes("no such table");
    return (
      <div className="py-20 text-center">
        <p className="font-display text-xl text-[var(--ink-3)] mb-4">
          {needsMigration
            ? (lang === "ja" ? "データベースの準備が必要です" : "Database setup required")
            : (lang === "ja" ? "データ読み込みエラー" : "Data load error")}
        </p>
        {needsMigration && (
          <div className="text-sm text-[var(--ink-4)] max-w-md mx-auto space-y-2">
            <p>{lang === "ja" ? "Cloudflare D1 Console で以下を実行してください：" : "Run the following in Cloudflare D1 Console:"}</p>
            <pre className="text-left bg-[var(--line-soft)] p-4 rounded-lg text-[11px] font-mono overflow-x-auto">
{`CREATE TABLE IF NOT EXISTS ransomware_victims (
  id INTEGER PRIMARY KEY,
  victim TEXT NOT NULL,
  group_name TEXT, country TEXT,
  activity TEXT, website TEXT,
  description TEXT, post_url TEXT,
  discovered TEXT, published TEXT,
  fetched_at TEXT DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_rw_country
  ON ransomware_victims(country);`}
            </pre>
          </div>
        )}
        <p className="text-[11px] text-[var(--ink-4)] mt-4 font-mono">{dbError}</p>
      </div>
    );
  }

  return (
    <Suspense
      fallback={
        <div className="py-20 text-center text-sm text-[var(--ink-3)]">
          読み込み中… / Loading…
        </div>
      }
    >
      <RansomwareClient
        victims={victims}
        groups={groups}
        totalCount={victims.length}
        latestDate={latestFetched}
        newsLastFetched={newsLastFetched}
        hasCache={victims.length > 0}
        lang={lang}
        selectedGroup={sp.group ?? ""}
      />
    </Suspense>
  );
}
