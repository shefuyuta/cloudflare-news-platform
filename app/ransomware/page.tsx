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
  public_url: string;
  discovered: string;
  published: string;
  country: string;
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
  searchParams: Promise<{ group?: string; activity?: string; country?: string; range?: string; page?: string; per?: string }>;
}) {
  const sp          = await searchParams;
  const env         = (await getCloudflareContext()).env as unknown as Env;
  const cookieStore = await cookies();
  const lang        = (cookieStore.get(LANG_COOKIE)?.value as Lang) ?? DEFAULT_LANG;

  // Country filter: "" or "all" = every country; "JP" = Japan; else the
  // given ISO code. Japan matches the historical JP/Japan/日本 variants.
  const countrySel  = (sp.country ?? "").trim();
  const activitySel = (sp.activity ?? "").trim();

  // Pagination. per ∈ {20,50,100} (default 20); page is 1-based.
  const perRaw  = parseInt(sp.per ?? "20", 10);
  const perPage = [20, 50, 100].includes(perRaw) ? perRaw : 20;
  const pageRaw = parseInt(sp.page ?? "1", 10);
  const page    = Number.isFinite(pageRaw) && pageRaw > 0 ? pageRaw : 1;

  // Time range on `discovered`. Default 24h ("today"). Values:
  // today = last 24h, week = last 7d, month = last 30d, all = no limit.
  const rangeSel    = (sp.range ?? "today").trim();
  const rangeCutoff = ((): string | null => {
    const now = Date.now();
    switch (rangeSel) {
      case "week":  return new Date(now - 7  * 86400000).toISOString();
      case "month": return new Date(now - 30 * 86400000).toISOString();
      case "all":   return null;
      case "today":
      default:      return new Date(now - 1  * 86400000).toISOString();
    }
  })();

  let victims: VictimWithNews[] = [];
  let groups:  string[]          = [];
  let countries: { code: string; count: number }[] = [];
  const mapCounts: Record<string, number> = {};
  // Server-side aggregates over the FULL range-filtered set (not the
  // LIMIT-200 list), so the charts agree with the world map.
  let statTotal = 0;
  let byGroup:    [string, number][] = [];
  let byActivity: [string, number][] = [];
  let byMonth:    [string, number][] = [];
  let byGroupMonth: { months: string[]; series: { group: string; points: number[] }[] } = { months: [], series: [] };
  let byActivityMonth: { months: string[]; series: { group: string; points: number[] }[] } = { months: [], series: [] };
  let surgingGroups: { group: string; recent: number; prior: number; growthPct: number | null }[] = [];
  let hasAnyData  = false;   // true if the table has ANY rows (ignores filters)
  let dbError: string | null     = null;
  let latestFetched              = "";  // Last ransomware.live sync

  try {
    // ── Build WHERE clause for country + group ────────────────────────
    const where: string[] = [];
    const binds: unknown[] = [];
    // Country condition kept separate so the per-group trend chart can honor
    // the country filter WITHOUT also inheriting the group/range filters
    // (a group filter would collapse the trend to one line; the trend is
    // deliberately full-history regardless of the range toggle).
    const countryWhere: string[] = ["discovered != ''"];
    const countryBinds: unknown[] = [];
    if (countrySel && countrySel !== "all") {
      if (countrySel === "JP") {
        where.push("country IN ('JP', 'Japan', '日本')");
        countryWhere.push("country IN ('JP', 'Japan', '日本')");
      } else if (countrySel === "??") {
        // Unknown-country bucket: empty string or NULL.
        where.push("(country IS NULL OR TRIM(country) = '')");
        countryWhere.push("(country IS NULL OR TRIM(country) = '')");
      } else {
        where.push("country = ?");
        binds.push(countrySel);
        countryWhere.push("country = ?");
        countryBinds.push(countrySel);
      }
    }
    if (sp.group) {
      where.push("LOWER(group_name) = LOWER(?)");
      binds.push(sp.group);
    }
    if (sp.activity) {
      where.push("LOWER(activity) = LOWER(?)");
      binds.push(sp.activity);
    }
    // Country + group + activity, but NOT range: for trend charts that
    // should narrow to the selected group/industry while staying
    // full-history. Two exclusions, mirrored:
    //  - the per-GROUP trend chart does NOT apply the group filter to
    //    itself (would collapse the group comparison to one line)
    //  - the per-INDUSTRY trend chart does NOT apply the activity filter
    //    to itself, for the same reason
    // Both charts DO still pick up country/group/activity filters that
    // aren't "about themselves" (e.g. industry trend narrows by group).
    const trendWhere  = [...countryWhere];
    const trendBinds  = [...countryBinds];
    if (sp.group) {
      trendWhere.push("LOWER(group_name) = LOWER(?)");
      trendBinds.push(sp.group);
    }
    if (sp.activity) {
      trendWhere.push("LOWER(activity) = LOWER(?)");
      trendBinds.push(sp.activity);
    }
    // Group trend: country + activity, but never group (see above).
    const groupTrendWhere = [...countryWhere];
    const groupTrendBinds = [...countryBinds];
    if (sp.activity) {
      groupTrendWhere.push("LOWER(activity) = LOWER(?)");
      groupTrendBinds.push(sp.activity);
    }
    // Industry trend: country + group, but never activity (see above) —
    // built independently from trendWhere, which includes activity.
    const actTrendWhere = [...countryWhere];
    const actTrendBinds = [...countryBinds];
    if (sp.group) {
      actTrendWhere.push("LOWER(group_name) = LOWER(?)");
      actTrendBinds.push(sp.group);
    }
    if (rangeCutoff) {
      // discovered is ISO-ish ("YYYY-MM-DD HH:MM:SS" or ISO). datetime()
      // normalizes both sides for a correct comparison.
      where.push("datetime(discovered) >= datetime(?)");
      binds.push(rangeCutoff);
    }
    const whereSql = where.length ? "WHERE " + where.join(" AND ") : "";

    const victimRows = await env.DB.prepare(
      `SELECT id, victim, victim_ja, group_name, activity, website, description,
              post_url, public_url, discovered, published, country
       FROM ransomware_victims
       ${whereSql}
       ORDER BY discovered DESC, published DESC LIMIT ? OFFSET ?`
    ).bind(...binds, perPage, (page - 1) * perPage).all();

    const rawVictims = (victimRows.results ?? []) as RawVictim[];

    // ── Server-side aggregates over the FULL filtered set ─────────────
    // These power the stat charts (group / activity / monthly) so they
    // reflect every matching victim, not just the LIMIT-200 list.
    const [totalRow, groupRows, actRows, monthRows, groupMonthRows, actMonthRows, surgeRows] = await Promise.all([
      env.DB.prepare(`SELECT COUNT(*) AS c FROM ransomware_victims ${whereSql}`).bind(...binds).first() as Promise<{ c: number } | null>,
      env.DB.prepare(`SELECT group_name AS k, COUNT(*) AS c FROM ransomware_victims ${whereSql} GROUP BY group_name ORDER BY c DESC LIMIT 8`).bind(...binds).all(),
      env.DB.prepare(`SELECT activity AS k, COUNT(*) AS c FROM ransomware_victims ${whereSql} GROUP BY activity ORDER BY c DESC LIMIT 8`).bind(...binds).all(),
      // Monthly trend is full-history (ignores range) so the line chart
      // always shows the trend, but DOES honor country + group filters —
      // a selected group narrows this to that group's monthly trend.
      env.DB.prepare(`SELECT substr(discovered,1,7) AS k, COUNT(*) AS c FROM ransomware_victims WHERE ${trendWhere.join(" AND ")} GROUP BY k ORDER BY k ASC`).bind(...trendBinds).all(),
      // Month x group breakdown — powers the per-group trend lines. Honors
      // the COUNTRY filter (so a selected country shows only its groups) but
      // not group/range. Aggregated to top-5 groups on the server below.
      env.DB.prepare(`SELECT substr(discovered,1,7) AS m, group_name AS g, COUNT(*) AS c FROM ransomware_victims WHERE ${groupTrendWhere.join(" AND ")} GROUP BY m, g`).bind(...groupTrendBinds).all(),
      // Month x activity (industry) breakdown — powers the industry trend
      // lines. Honors country + group (a selected group narrows this to
      // which industries THAT group targets over time).
      env.DB.prepare(`SELECT substr(discovered,1,7) AS m, activity AS g, COUNT(*) AS c FROM ransomware_victims WHERE ${actTrendWhere.join(" AND ")} GROUP BY m, g`).bind(...actTrendBinds).all(),
      // Surge detection: group_name + which 7-day bucket (recent vs prior)
      // each victim falls into, over the last 14 days. Honors the COUNTRY
      // filter like the trend query. Shaped into a surge list server-side.
      env.DB.prepare(`
        SELECT group_name AS g,
               CASE WHEN julianday('now') - julianday(discovered) < 7 THEN 'recent' ELSE 'prior' END AS bucket,
               COUNT(*) AS c
        FROM ransomware_victims
        WHERE ${groupTrendWhere.join(" AND ")} AND discovered != '' AND julianday('now') - julianday(discovered) < 14
        GROUP BY g, bucket
      `).bind(...groupTrendBinds).all(),
    ]);
    statTotal  = totalRow?.c ?? 0;
    byGroup    = (groupRows.results ?? []).map(r => [(r as {k:string}).k || "Unknown", Number((r as {c:number}).c)] as [string, number]);
    byActivity = (actRows.results ?? []).map(r => [(r as {k:string}).k || "Unknown", Number((r as {c:number}).c)] as [string, number]);
    byMonth    = (monthRows.results ?? []).map(r => [(r as {k:string}).k, Number((r as {c:number}).c)] as [string, number]).slice(-12);

    // Shape a month x label breakdown into a top-5-by-total trend series,
    // over the last 12 months. Used for both group and activity (industry)
    // trends — same shape, same "top 5, no Other rollup" rule.
    function shapeMonthTrend(rows: { m: string; g: string; c: number }[]) {
      const totals = new Map<string, number>();
      const monthsSet = new Set<string>();
      for (const row of rows) {
        const g = row.g || "Unknown";
        totals.set(g, (totals.get(g) ?? 0) + Number(row.c));
        if (row.m) monthsSet.add(row.m);
      }
      const months = [...monthsSet].sort().slice(-12);
      const monthIdx = new Map(months.map((m, i) => [m, i]));
      const top5 = [...totals.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([g]) => g);
      const top5Set = new Set(top5);

      const series = new Map<string, number[]>();
      for (const g of top5) series.set(g, new Array(months.length).fill(0));
      for (const row of rows) {
        const i = monthIdx.get(row.m);
        if (i === undefined) continue;
        const g = row.g || "Unknown";
        if (top5Set.has(g)) series.get(g)![i] += Number(row.c);
      }
      return { months, series: top5.map(g => ({ group: g, points: series.get(g)! })) };
    }

    byGroupMonth    = shapeMonthTrend((groupMonthRows.results ?? []) as { m: string; g: string; c: number }[]);
    byActivityMonth = shapeMonthTrend((actMonthRows.results ?? []) as { m: string; g: string; c: number }[]);

    // Shape surge detection: recent-7d vs prior-7d per group. A minimum
    // recent-count floor (3) avoids flagging noise like "1 -> 2 victims"
    // as a 100% surge. growthPct is null when prior=0 (can't divide) but
    // recent clears the floor — treated as "new/reactivated" rather than
    // a numeric percentage.
    {
      const sr = (surgeRows.results ?? []) as { g: string; bucket: string; c: number }[];
      const byG = new Map<string, { recent: number; prior: number }>();
      for (const row of sr) {
        const g = row.g || "Unknown";
        const entry = byG.get(g) ?? { recent: 0, prior: 0 };
        if (row.bucket === "recent") entry.recent += Number(row.c);
        else entry.prior += Number(row.c);
        byG.set(g, entry);
      }
      const MIN_RECENT = 3;
      surgingGroups = [...byG.entries()]
        .filter(([, v]) => v.recent >= MIN_RECENT && v.recent > v.prior)
        .map(([group, v]) => ({
          group, recent: v.recent, prior: v.prior,
          growthPct: v.prior > 0 ? Math.round(((v.recent - v.prior) / v.prior) * 100) : null,
        }))
        .sort((a, b) => (b.growthPct ?? 9999) - (a.growthPct ?? 9999) || b.recent - a.recent)
        .slice(0, 3);
    }

    // Does the table hold ANY rows (regardless of the active filter)? This
    // separates "no data fetched yet" from "no data in this range".
    const anyRow = await env.DB.prepare("SELECT 1 FROM ransomware_victims LIMIT 1").first();
    hasAnyData = !!anyRow;

    // Last ransomware.live sync time. This is the DB-wide sync timestamp,
    // independent of the active range/country filter, so it's queried
    // OUTSIDE the "has victims in range" block — otherwise it vanishes
    // whenever a filter yields zero rows (same class of bug as hasCache).
    const rwTimestamp = await env.DB.prepare(
      "SELECT MAX(fetched_at) as ts FROM ransomware_victims"
    ).first() as { ts: string } | null;
    latestFetched = rwTimestamp?.ts ?? "";

    // Country list with counts for the filter UI. Respects the RANGE
    // filter (so the detail list shows this period's counts) but ignores
    // the country/group filter — it's the selector itself. JP variants
    // fold into "JP".
    const clWhere: string[] = [];
    const clBinds: unknown[] = [];
    if (rangeCutoff) { clWhere.push("datetime(discovered) >= datetime(?)"); clBinds.push(rangeCutoff); }
    const countryRows = await env.DB.prepare(
      `SELECT country, COUNT(*) AS cnt FROM ransomware_victims
       ${clWhere.length ? "WHERE " + clWhere.join(" AND ") : ""}
       GROUP BY country ORDER BY cnt DESC`
    ).bind(...clBinds).all();
    const countryMap = new Map<string, number>();
    for (const row of countryRows.results ?? []) {
      const r = row as { country: string; cnt: number };
      const raw = (r.country ?? "").trim();
      // Unknown/empty country → "??" bucket, kept as a real, filterable
      // option (the filter query maps "??" back to empty/NULL).
      const code = (raw === "Japan" || raw === "日本") ? "JP" : (raw || "??");
      countryMap.set(code, (countryMap.get(code) ?? 0) + Number(r.cnt));
    }
    countries = [...countryMap.entries()]
      .map(([code, count]) => ({ code, count }))
      .sort((a, b) => b.count - a.count);

    // Per-country counts for the world map. Respects the RANGE filter (so
    // the map reacts to today/7d/30d) but ignores the country filter,
    // since the map is only shown in global view. JP variants fold to JP.
    const mapWhere: string[] = [];
    const mapBinds: unknown[] = [];
    if (rangeCutoff) { mapWhere.push("datetime(discovered) >= datetime(?)"); mapBinds.push(rangeCutoff); }
    const mapRows = await env.DB.prepare(
      `SELECT country, COUNT(*) AS cnt FROM ransomware_victims
       ${mapWhere.length ? "WHERE " + mapWhere.join(" AND ") : ""}
       GROUP BY country`
    ).bind(...mapBinds).all();
    for (const row of mapRows.results ?? []) {
      const r = row as { country: string; cnt: number };
      const raw = (r.country ?? "").trim();
      if (!raw) continue;
      const code = (raw === "Japan" || raw === "日本") ? "JP" : raw.toUpperCase();
      if (code.length !== 2) continue; // only ISO alpha-2 maps to the SVG
      mapCounts[code] = (mapCounts[code] ?? 0) + Number(r.cnt);
    }

    // ── Find related news (batched, not per-victim) ────────────────────
    const newsMap = new Map<string, VictimWithNews["relatedNews"]>();

    if (rawVictims.length > 0) {
      // Collect unique meaningful search terms from victim names only.
      // Build search terms: Japanese name → individual English words.
      // Word-splitting handles "Nara Medical University Hospital" → ["Nara", "Medical"] etc.
      //
      // Deliberately NOT including v.group_name as a search term (it was,
      // until this fix): a group name alone matches ANY article about that
      // ransomware group, including its other, unrelated victims — e.g. a
      // RedPacketSecurity feed posts near-identical "[QILIN] – Ransomware
      // Victim: X" articles for every Qilin victim, and group-name matching
      // pulled ALL of them into every Qilin victim's "related articles",
      // regardless of whether the article was actually about that specific
      // company. Matching on victim name only keeps this section on-topic
      // for the company it's attached to.
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
              // Match against victim name only (see the comment above on
              // why group_name was removed from the search terms) — kept
              // consistent here too, since terms are now always
              // victim-derived.
              const haystack = `${v.victim} ${v.victim_ja ?? ""}`.toLowerCase();
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
        publicUrl:    v.public_url,
        discovered:   v.discovered,
        discoveredFmt: fmtDate(v.discovered || v.published || "", lang),
        country:      (v.country ?? "").trim(),
        relatedNews:  newsMap.get(String(v.id)) ?? [],
      }));

      const groupSet = new Set(rawVictims.map(v => v.group_name).filter(Boolean));
      groups = [...groupSet].sort();


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
        countries={countries}
        totalCount={victims.length}
        latestDate={latestFetched}
        hasCache={hasAnyData}
        statTotal={statTotal}
        byGroup={byGroup}
        byActivity={byActivity}
        byMonth={byMonth}
        byGroupMonth={byGroupMonth}
        byActivityMonth={byActivityMonth}
        surgingGroups={surgingGroups}
        lang={lang}
        selectedGroup={sp.group ?? ""}
        selectedActivity={activitySel}
        selectedCountry={countrySel}
        selectedRange={rangeSel}
        mapCounts={mapCounts}
        page={page}
        perPage={perPage}
      />
    </Suspense>
  );
}
