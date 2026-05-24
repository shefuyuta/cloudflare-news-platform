// components/ransomware/RansomwareClient.tsx
"use client";

import { useState } from "react";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { ExternalLink, RefreshCw, Shield, ChevronRight } from "@/components/ui/Icon";
import type { VictimWithNews } from "@/lib/ransomware";
import { RansomwareStats } from "./RansomwareStats";

const GROUP_COLORS: Record<string, string> = {
  lockbit3:   "#dc2626", lockbit: "#dc2626",
  alphv:      "#7c3aed", blackcat: "#7c3aed",
  clop:       "#d97706", cl0p: "#d97706",
  play:       "#0284c7",
  akira:      "#059669",
  "8base":    "#db2777",
  ransomhub:  "#ea580c",
  rhysida:    "#4f46e5",
  medusa:     "#0891b2",
  qilin:      "#65a30d",
  dragonforce:"#dc2626",
};

function groupColor(group: string): string {
  return GROUP_COLORS[group?.toLowerCase()] ?? "#6b7280";
}

interface Props {
  victims:       VictimWithNews[];
  groups:        string[];
  totalCount:    number;
  latestDate:    string;
  hasCache:      boolean;
  lang:          string;
  selectedGroup: string;
}

export function RansomwareClient({
  victims, groups, totalCount, latestDate, hasCache, lang, selectedGroup,
}: Props) {
  const router   = useRouter();
  const pathname = usePathname();
  const params   = useSearchParams();

  const [fetching,    setFetching]    = useState(false);
  const [fetchResult, setFetchResult] = useState<string | null>(null);
  const [openId,      setOpenId]      = useState<string | null>(null);

  const ja = lang === "ja";

  async function refresh() {
    if (fetching) return;
    setFetching(true);
    setFetchResult(ja ? "ransomware.live から取得中…" : "Fetching from ransomware.live…");
    try {
      const res  = await fetch("/api/ransomware-fetch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ months: 3 }),
      });
      const data = await res.json() as { upserted: number; scanned: number };
      setFetchResult(
        ja
          ? `${data.upserted}件の日本被害を取得しました（スキャン: ${data.scanned}件）`
          : `Fetched ${data.upserted} JP victims (scanned: ${data.scanned})`
      );
      router.refresh();
    } catch {
      setFetchResult(ja ? "取得に失敗しました" : "Fetch failed");
    } finally {
      setFetching(false);
      setTimeout(() => setFetchResult(null), 8000);
    }
  }

  function setGroup(g: string) {
    const sp = new URLSearchParams(params);
    if (g) sp.set("group", g); else sp.delete("group");
    router.push(`${pathname}?${sp.toString()}`);
  }

  return (
    <div>
      {/* ── Header ──────────────────────────────────────────────────── */}
      <header className="mb-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="font-display text-3xl md:text-4xl font-semibold tracking-tight flex items-center gap-3">
              <Shield size={28} strokeWidth={1.5} className="text-red-600" />
              {ja ? "日本国内ランサムウェア被害" : "Japan Ransomware Victims"}
            </h1>
            <p className="text-sm text-[var(--ink-3)] mt-2">
              {ja
                ? `ransomware.live より取得。${totalCount}件の国内被害を表示中。`
                : `Sourced from ransomware.live. Showing ${totalCount} Japan victims.`}
              {latestDate && (
                <span className="ml-2 text-[var(--ink-4)]">
                  {ja ? `最新: ${latestDate}` : `Latest: ${latestDate}`}
                </span>
              )}
            </p>
          </div>

          {/* Refresh button */}
          <button
            onClick={refresh}
            disabled={fetching}
            className="flex-shrink-0 flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-medium rounded-md ring-1 ring-inset ring-[var(--line)] text-[var(--ink-2)] hover:bg-[var(--line-soft)] disabled:opacity-40 transition-colors"
          >
            <RefreshCw size={12} strokeWidth={1.5} className={fetching ? "animate-spin" : ""} />
            {fetching ? (ja ? "取得中…" : "Fetching…") : (ja ? "データ更新" : "Refresh")}
          </button>
        </div>

        {fetchResult && (
          <p className="mt-2 text-[11px] text-emerald-600 font-medium">{fetchResult}</p>
        )}

        {/* Disclaimer */}
        <div className="mt-4 p-3 bg-amber-50 border border-amber-200 rounded-lg text-[11px] text-amber-800 leading-relaxed">
          ⚠ {ja
            ? "このデータはランサムウェアグループが公開したリークサイト情報に基づきます。被害企業の公式発表とは異なる場合があります。情報の正確性・完全性は保証されません。"
            : "This data is based on information published on ransomware group leak sites and may differ from official company statements. Accuracy and completeness are not guaranteed."}
        </div>
      </header>

      {/* ── Empty state ─────────────────────────────────────────────── */}
      {!hasCache && (
        <div className="py-20 text-center border hairline rounded-lg">
          <Shield size={40} strokeWidth={1} className="mx-auto mb-4 text-[var(--ink-4)]" />
          <p className="font-display text-lg text-[var(--ink-3)] mb-2">
            {ja ? "データがありません" : "No data yet"}
          </p>
          <p className="text-sm text-[var(--ink-4)] mb-6">
            {ja ? "「データ更新」を押して ransomware.live から取得してください。" : "Press \"Refresh\" to fetch data from ransomware.live."}
          </p>
          <button
            onClick={refresh}
            disabled={fetching}
            className="px-4 py-2 text-sm font-medium rounded-md bg-[var(--ink)] text-ink-contrast hover:bg-black disabled:opacity-40 transition-colors flex items-center gap-2 mx-auto"
          >
            <RefreshCw size={14} strokeWidth={1.5} className={fetching ? "animate-spin" : ""} />
            {ja ? "今すぐ取得" : "Fetch now"}
          </button>
        </div>
      )}

      {hasCache && (
        <>
          {/* ── Statistics ─────────────────────────────────────────────── */}
          <RansomwareStats victims={victims} lang={lang} />

          {/* ── Group filter ──────────────────────────────────────────── */}
          {groups.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mb-6">
              <button
                onClick={() => setGroup("")}
                className={[
                  "px-2.5 py-1 text-[11px] font-medium rounded-full border transition-colors",
                  !selectedGroup ? "bg-[var(--ink)] text-ink-contrast border-[var(--ink)]" : "border-[var(--line)] text-[var(--ink-2)] hover:bg-[var(--line-soft)]",
                ].join(" ")}
              >
                {ja ? "すべて" : "All"} ({totalCount})
              </button>
              {groups.map(g => {
                const count = victims.filter(v => v.group === g).length;
                if (!count) return null;
                return (
                  <button
                    key={g}
                    onClick={() => setGroup(g === selectedGroup ? "" : g)}
                    className={[
                      "px-2.5 py-1 text-[11px] font-medium rounded-full border transition-colors",
                      selectedGroup === g
                        ? "text-white border-transparent"
                        : "border-[var(--line)] text-[var(--ink-2)] hover:bg-[var(--line-soft)]",
                    ].join(" ")}
                    style={selectedGroup === g ? { background: groupColor(g) } : undefined}
                  >
                    {g} ({count})
                  </button>
                );
              })}
            </div>
          )}

          {/* ── Victim list ───────────────────────────────────────────── */}
          <div className="space-y-0 divide-y divide-[var(--line)]">
            {victims.map(v => (
              <VictimRow
                key={v.uid}
                victim={v}
                isOpen={openId === v.uid}
                onToggle={() => setOpenId(prev => prev === v.uid ? null : v.uid)}
                lang={lang}
              />
            ))}
          </div>
        </>
      )}

      {/* ── Source attribution ────────────────────────────────────────── */}
      <div className="mt-10 pt-4 border-t hairline flex items-center gap-2 text-[11px] text-[var(--ink-4)]">
        <span>{ja ? "データ提供元:" : "Data source:"}</span>
        <a
          href="https://ransomware.live"
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-1 hover:text-[var(--ink-2)] transition-colors"
        >
          ransomware.live <ExternalLink size={10} strokeWidth={1.5} />
        </a>
        <span className="ml-4">
          {ja ? "※ダークウェブリークサイト情報に基づく非公式データ" : "※Unofficial data based on dark web leak sites"}
        </span>
      </div>
    </div>
  );
}

// ── Individual victim row ─────────────────────────────────────────────

function VictimRow({ victim: v, isOpen, onToggle, lang }: {
  victim: VictimWithNews;
  isOpen: boolean;
  onToggle: () => void;
  lang: string;
}) {
  const ja = lang === "ja";
  const color = groupColor(v.group);

  return (
    <article className="py-4">
      {/* Row header */}
      <div
        className="flex items-start gap-3 cursor-pointer group"
        onClick={onToggle}
      >
        <span className={[
          "mt-1.5 text-[var(--ink-4)] transition-transform duration-200 flex-shrink-0",
          isOpen ? "rotate-90" : "",
        ].join(" ")}>
          <ChevronRight size={14} strokeWidth={1.5} />
        </span>

        <div className="flex-1 min-w-0">
          {/* Meta row */}
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            {/* Group badge */}
            <span
              className="text-[10px] font-semibold px-2 py-0.5 rounded-full text-white"
              style={{ background: color }}
            >
              {v.groupDisplay}
            </span>
            {/* Industry */}
            {v.activity && (
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-[var(--line-soft)] text-[var(--ink-2)]">
                {v.activity}
              </span>
            )}
            {/* Related news indicator */}
            {v.relatedNews.length > 0 && (
              <span className="text-[10px] text-emerald-700 font-medium bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
                {ja ? `関連記事 ${v.relatedNews.length}件` : `${v.relatedNews.length} related`}
              </span>
            )}
            <span className="ml-auto text-[11px] text-[var(--ink-4)] font-mono flex-shrink-0">
              {v.discoveredFmt}
            </span>
          </div>

          {/* Victim name */}
          <h2 className="font-display text-lg font-medium leading-snug text-[var(--ink)] group-hover:text-[var(--ink-2)] transition-colors">
            {v.victimJa && v.victimJa !== v.victim ? v.victimJa : v.victim}
          </h2>
          {v.victimJa && v.victimJa !== v.victim && (
            <span className="text-[11px] text-[var(--ink-4)] font-mono">{v.victim}</span>
          )}
          {v.website && (
            <span className="text-[11px] text-[var(--ink-3)] font-mono ml-2">{v.website}</span>
          )}
        </div>
      </div>

      {/* Expanded detail */}
      {isOpen && (
        <div className="ml-7 mt-3 pl-3 border-l-2 border-[var(--line)] animate-fadeIn space-y-4">

          {/* Description */}
          {v.description && (
            <p className="text-sm text-[var(--ink-2)] leading-relaxed">{v.description}</p>
          )}

          {/* Leak site link */}
          {v.post_url && (
            <div className="text-[11px]">
              <span className="text-[var(--ink-4)] mr-2">{ja ? "リークサイト:" : "Leak site:"}</span>
              <span className="font-mono text-[var(--ink-3)] bg-[var(--line-soft)] px-2 py-0.5 rounded text-[10px]">
                {ja
                  ? "⚠ ダークウェブ上のURLのため直接アクセス不可"
                  : "⚠ Dark web URL — not directly accessible"}
              </span>
            </div>
          )}

          {/* Related news */}
          {v.relatedNews.length > 0 ? (
            <div>
              <p className="text-[10px] uppercase tracking-widest text-[var(--ink-3)] mb-2">
                {ja ? "関連ニュース" : "Related News"}
              </p>
              <div className="space-y-2">
                {v.relatedNews.map(news => (
                  <a
                    key={news.id}
                    href={news.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-start gap-2 p-2.5 rounded-lg border hairline hover:bg-[var(--line-soft)] transition-colors group/news"
                  >
                    <ExternalLink size={12} strokeWidth={1.5} className="mt-0.5 flex-shrink-0 text-[var(--ink-3)] group-hover/news:text-[var(--ink)]" />
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-[var(--ink)] group-hover/news:underline leading-snug">
                        {news.title}
                      </p>
                      <p className="text-[10px] text-[var(--ink-3)] mt-0.5">
                        {news.source} · {news.publishedAt ? new Date(news.publishedAt).toLocaleDateString(lang === "ja" ? "ja-JP" : "en-US", { month: "short", day: "numeric" }) : ""}
                      </p>
                    </div>
                  </a>
                ))}
              </div>
            </div>
          ) : (
            <div className="text-[11px] text-[var(--ink-4)] italic">
              {ja ? "関連ニュースは見つかりませんでした。" : "No related news found in the database."}
            </div>
          )}
        </div>
      )}
    </article>
  );
}
