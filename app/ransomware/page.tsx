// app/ransomware/page.tsx
// Japan ransomware victim tracker — data from ransomware.live + related news from D1.
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { listArticles } from "@/lib/db";
import { groupDisplayName, fmtDate } from "@/lib/ransomware";
import { RansomwareClient } from "@/components/ransomware/RansomwareClient";
import type { Env } from "@/lib/types";
import { cookies } from "next/headers";
import { type Lang, DEFAULT_LANG, LANG_COOKIE } from "@/lib/i18n";
export const dynamic = "force-dynamic";

export interface VictimWithNews {
  id:          number;
  victim:      string;
  group:       string;
  groupDisplay: string;
  activity:    string;
  website:     string;
  description: string;
  post_url:    string;
  discovered:  string;
  discoveredFmt: string;
  relatedNews: {
    id: string;
    title: string;
    url: string;
    source: string;
    publishedAt: string;
  }[];
}

export default async function RansomwarePage({ searchParams }: {
  searchParams: Promise<{ group?: string; months?: string }>;
}) {
  const sp   = await searchParams;
  const env  = (await getCloudflareContext()).env as unknown as Env;
  const cookieStore = await cookies();
  const lang = (cookieStore.get(LANG_COOKIE)?.value as Lang) ?? DEFAULT_LANG;

  // Fetch from cache table
  let query = `
    SELECT id, victim, group_name, activity, website, description, post_url, discovered, published
    FROM ransomware_victims
    WHERE country IN ('JP', 'Japan', '日本')
  `;
  const binds: (string | number)[] = [];

  if (sp.group) {
    query += ` AND LOWER(group_name) = LOWER(?)`;
    binds.push(sp.group);
  }

  query += ` ORDER BY discovered DESC, published DESC LIMIT 200`;

  const rows = await env.DB.prepare(query).bind(...binds).all();
  const rawVictims = (rows.results ?? []) as {
    id: number; victim: string; group_name: string; activity: string;
    website: string; description: string; post_url: string;
    discovered: string; published: string;
  }[];

  // For each victim, find related news by searching victim name + group name
  const victims: VictimWithNews[] = await Promise.all(
    rawVictims.map(async (v) => {
      const searchTerms = [v.victim, v.group_name].filter(Boolean).join(" ");
      const news = searchTerms
        ? await listArticles(env, { q: searchTerms, noTimeLimit: true, limit: 3 })
        : [];

      return {
        id:          v.id,
        victim:      v.victim,
        group:       v.group_name,
        groupDisplay: groupDisplayName(v.group_name),
        activity:    v.activity,
        website:     v.website,
        description: v.description,
        post_url:    v.post_url,
        discovered:  v.discovered,
        discoveredFmt: fmtDate(v.discovered || v.published, lang),
        relatedNews: news.map(a => ({
          id:          a.id,
          title:       a.title,
          url:         a.url,
          source:      a.source,
          publishedAt: a.publishedAt,
        })),
      };
    })
  );

  // Group list for filter
  const groupSet = new Set(rawVictims.map(v => v.group_name).filter(Boolean));
  const groups   = [...groupSet].sort();

  // Stats
  const totalCount   = victims.length;
  const latestDate   = victims[0]?.discovered ?? "";
  const hasCache     = totalCount > 0;

  return (
    <RansomwareClient
      victims={victims}
      groups={groups}
      totalCount={totalCount}
      latestDate={latestDate}
      hasCache={hasCache}
      lang={lang}
      selectedGroup={sp.group ?? ""}
    />
  );
}
