// components/ransomware/RansomwareClient.tsx
"use client";

import { useState, useTransition } from "react";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { ExternalLink, RefreshCw, Shield, ChevronRight } from "@/components/ui/Icon";
import type { VictimWithNews } from "@/lib/ransomware";
import { RansomwareStats } from "./RansomwareStats";
import { WorldMap } from "./WorldMap";

/**
 * Country flag as an image (not an emoji). Windows browsers don't render
 * Regional Indicator emoji flags — they show the two letters instead (e.g.
 * "NG NG") — so we use flagcdn.com PNGs, which render everywhere. Falls back
 * to a 🌐 glyph for unknown / non-2-letter codes. Renders inline, sized to
 * sit next to the country code text.
 */
function CountryFlag({ code }: { code: string }) {
  const c = (code || "").trim().toLowerCase();
  if (!/^[a-z]{2}$/.test(c)) return <span aria-hidden>🌐</span>;
  return (
    <img
      src={`https://flagcdn.com/20x15/${c}.png`}
      srcSet={`https://flagcdn.com/40x30/${c}.png 2x`}
      width={14}
      height={11}
      alt={code.toUpperCase()}
      className="inline-block align-[-1px] rounded-[1px]"
      loading="lazy"
    />
  );
}

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
  countries:     { code: string; count: number }[];
  totalCount:    number;
  latestDate:    string;
  hasCache:      boolean;
  statTotal:     number;
  byGroup:       [string, number][];
  byActivity:    [string, number][];
  byMonth:       [string, number][];
  byGroupMonth:  { months: string[]; series: { group: string; points: number[] }[] };
  byActivityMonth: { months: string[]; series: { group: string; points: number[] }[] };
  surgingGroups: { group: string; recent: number; prior: number; growthPct: number | null }[];
  lang:          string;
  selectedGroup: string;
  selectedCountry: string;
  selectedRange: string;
  mapCounts: Record<string, number>;
  page: number;
  perPage: number;
}

export function RansomwareClient({
  victims, groups, countries, totalCount, latestDate, hasCache, statTotal, byGroup, byActivity, byMonth, byGroupMonth, byActivityMonth, surgingGroups, lang, selectedGroup, selectedCountry, selectedRange, mapCounts, page, perPage,
}: Props) {
  const router   = useRouter();
  const pathname = usePathname();
  const params   = useSearchParams();

  const [fetching,    setFetching]    = useState(false);
  const [fetchResult, setFetchResult] = useState<string | null>(null);
  const [openId,      setOpenId]      = useState<string | null>(null);
  const [showCountries, setShowCountries] = useState(false);
  const [isPending, startTransition] = useTransition();

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
    sp.delete("page");
    startTransition(() => router.push(`${pathname}?${sp.toString()}`));
  }

  function setCountry(c: string) {
    const sp = new URLSearchParams(params);
    if (c && c !== "all") sp.set("country", c); else sp.delete("country");
    sp.delete("page");
    startTransition(() => router.push(`${pathname}?${sp.toString()}`));
  }

  function setRange(r: string) {
    const sp = new URLSearchParams(params);
    // "today" is the default; keep the URL clean by omitting it.
    if (r && r !== "today") sp.set("range", r); else sp.delete("range");
    sp.delete("page"); // reset to page 1 when the filter changes
    startTransition(() => router.push(`${pathname}?${sp.toString()}`));
  }

  function setPer(n: number) {
    const sp = new URLSearchParams(params);
    if (n !== 20) sp.set("per", String(n)); else sp.delete("per");
    sp.delete("page"); // reset to page 1 when page size changes
    startTransition(() => router.push(`${pathname}?${sp.toString()}`));
  }

  function goToPage(p: number) {
    const sp = new URLSearchParams(params);
    if (p > 1) sp.set("page", String(p)); else sp.delete("page");
    startTransition(() => router.push(`${pathname}?${sp.toString()}`));
  }

  return (
    <div>
      {/* ── Header ──────────────────────────────────────────────────── */}
      <header className="mb-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="font-display text-3xl md:text-4xl font-semibold tracking-tight flex items-center gap-3">
              <Shield size={28} strokeWidth={1.5} className="text-red-600" />
              {ja ? "ランサムウェア被害" : "Ransomware Victims"}
            </h1>
            <p className="text-sm text-[var(--ink-3)] mt-2">
              {ja
                ? `ransomware.live より取得。全${statTotal.toLocaleString()}件。`
                : `Sourced from ransomware.live. ${statTotal.toLocaleString()} total.`}
              <div className="flex flex-col gap-0.5 mt-1">
                {latestDate && (
                  <span className="text-[11px] text-[var(--ink-4)]">
                    {ja
                      ? `🔴 被害データ更新: ${new Date(latestDate).toLocaleString("ja-JP", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}`
                      : `🔴 Victim data: ${new Date(latestDate).toLocaleString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}`}
                  </span>
                )}
              </div>
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
        <div className="relative">
          {/* Loading indicator during filter/page navigation */}
          {isPending && (
            <div className="absolute -top-1 left-0 right-0 z-20 h-0.5 overflow-hidden rounded">
              <div className="h-full w-1/3 bg-[var(--accent-cyber)] animate-[loadingbar_1s_ease-in-out_infinite]" />
            </div>
          )}
          <div className={isPending ? "opacity-60 transition-opacity pointer-events-none" : "transition-opacity"}>
          {/* ── Time-range filter (drives map, stats, graphs, counts) ───── */}
          <div className="flex flex-wrap items-center gap-1.5 mb-4">
            <span className="text-[11px] text-[var(--ink-3)] mr-1">
              {ja ? "期間:" : "Range:"}
            </span>
            {([
              { key: "today", ja: "24時間", en: "24h" },
              { key: "week",  ja: "7日間", en: "7d" },
              { key: "month", ja: "30日間", en: "30d" },
              { key: "all",   ja: "全期間", en: "All" },
            ] as const).map(r => (
              <button
                key={r.key}
                onClick={() => setRange(r.key)}
                className={[
                  "px-2.5 py-1 text-[11px] font-medium rounded-full border transition-colors",
                  (selectedRange || "today") === r.key
                    ? "bg-[var(--ink)] text-ink-contrast border-[var(--ink)]"
                    : "border-[var(--line)] text-[var(--ink-2)] hover:bg-[var(--line-soft)]",
                ].join(" ")}
              >
                {ja ? r.ja : r.en}
              </button>
            ))}
          </div>

          {/* ── World map (global view only, prominent) ─────────────────── */}
          {(!selectedCountry || selectedCountry === "all") && Object.keys(mapCounts).length > 0 && (
            <div className="mb-6">
              <WorldMap
                counts={mapCounts}
                lang={lang}
                selectedCountry={selectedCountry}
                onSelectCountry={setCountry}
              />
            </div>
          )}
          {/* When a specific country is selected the global map is hidden. */}
          {selectedCountry && selectedCountry !== "all" && (
            <div className="mb-6 flex items-center justify-between gap-2 px-3 py-2 border hairline rounded-lg text-[11px] text-[var(--ink-3)] bg-[var(--line-soft)]/40">
              <span>
                {ja
                  ? `「${selectedCountry === "JP" ? "日本" : selectedCountry}」で絞り込み中のため世界地図は非表示です。`
                  : `World map is hidden while filtered to "${selectedCountry}".`}
              </span>
              <button
                onClick={() => setCountry("all")}
                className="shrink-0 underline hover:text-[var(--ink)] transition-colors"
              >
                {ja ? "全世界に戻す" : "Back to global"}
              </button>
            </div>
          )}

          {/* ── Surge alert: groups whose 7-day victim count jumped ──────── */}
          {surgingGroups.length > 0 && (
            <div className="mb-4 flex flex-wrap gap-2">
              {surgingGroups.map(s => {
                const color = groupColor(s.group);
                return (
                  <button
                    key={s.group}
                    onClick={() => setGroup(s.group)}
                    className="inline-flex items-center gap-1.5 pl-1.5 pr-2.5 py-1 rounded-full ring-1 ring-inset text-[11px] font-medium transition-colors hover:brightness-95"
                    style={{ background: `${color}14`, borderColor: color, color }}
                  >
                    <span className="inline-block w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: color }} />
                    <span className="uppercase tracking-wide">
                      {ja ? "急増" : "Surging"}
                    </span>
                    <span className="font-mono">{s.group}</span>
                    <span className="opacity-70">
                      {s.growthPct !== null
                        ? `+${s.growthPct}%`
                        : (ja ? `新規 ${s.recent}件` : `new ×${s.recent}`)}
                    </span>
                  </button>
                );
              })}
            </div>
          )}

          {/* ── Statistics ─────────────────────────────────────────────── */}
          {statTotal > 0 ? (
            <RansomwareStats
              statTotal={statTotal}
              byGroup={byGroup}
              byActivity={byActivity}
              byMonth={byMonth}
              byGroupMonth={byGroupMonth}
              byActivityMonth={byActivityMonth}
              showMonthly={selectedRange === "all"}
              lang={lang}
            />
          ) : (
            <div className="py-12 text-center border hairline rounded-lg mb-6">
              <p className="text-sm text-[var(--ink-3)]">
                {ja ? "この期間に該当する被害はありません。" : "No victims in this range."}
              </p>
              <p className="text-[11px] text-[var(--ink-4)] mt-1">
                {ja ? "上の期間フィルタで範囲を広げてください。" : "Widen the range filter above."}
              </p>
            </div>
          )}

          {/* ── Country filter: Japan / Global + collapsible per-country ── */}
          <div className="mb-6">
            <div className="flex flex-wrap items-center gap-1.5">
              <button
                onClick={() => setCountry("all")}
                className={[
                  "px-2.5 py-1 text-[11px] font-medium rounded-full border transition-colors",
                  !selectedCountry || selectedCountry === "all"
                    ? "bg-[var(--ink)] text-ink-contrast border-[var(--ink)]"
                    : "border-[var(--line)] text-[var(--ink-2)] hover:bg-[var(--line-soft)]",
                ].join(" ")}
              >
                {ja ? "全世界" : "Global"}
              </button>
              <button
                onClick={() => setCountry("JP")}
                className={[
                  "px-2.5 py-1 text-[11px] font-medium rounded-full border transition-colors",
                  selectedCountry === "JP"
                    ? "bg-[var(--ink)] text-ink-contrast border-[var(--ink)]"
                    : "border-[var(--line)] text-[var(--ink-2)] hover:bg-[var(--line-soft)]",
                ].join(" ")}
              >
                {ja ? "日本" : "Japan"}
              </button>

              {/* Toggle for the detailed per-country list */}
              {countries.length > 1 && (
                <button
                  onClick={() => setShowCountries(s => !s)}
                  className="px-2 py-1 text-[11px] text-[var(--ink-3)] hover:text-[var(--ink)] inline-flex items-center gap-1 transition-colors"
                >
                  <ChevronRight
                    size={12}
                    strokeWidth={1.5}
                    className={`transition-transform ${showCountries ? "rotate-90" : ""}`}
                  />
                  {ja ? "国で絞り込む" : "Filter by country"}
                </button>
              )}
            </div>

            {/* Collapsible per-country toggles (default hidden) */}
            {showCountries && countries.length > 1 && (
              <div className="mt-2 p-3 border hairline rounded-lg flex flex-wrap gap-1.5 bg-[var(--line-soft)]/40">
                {countries.map(({ code, count }) => (
                  <button
                    key={code}
                    onClick={() => setCountry(code === selectedCountry ? "all" : code)}
                    className={[
                      "px-2 py-0.5 text-[11px] font-medium rounded-full border transition-colors",
                      selectedCountry === code
                        ? "bg-[var(--ink)] text-ink-contrast border-[var(--ink)]"
                        : "border-[var(--line)] text-[var(--ink-2)] hover:bg-[var(--line-soft)]",
                    ].join(" ")}
                  >
                    {code === "??"
                      ? (lang === "ja" ? "国不明" : "Unknown")
                      : <><CountryFlag code={code} /> {code}</>} ({count})
                  </button>
                ))}
              </div>
            )}
          </div>

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
                {ja ? "すべて" : "All"} ({statTotal.toLocaleString()})
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

          {/* ── List controls: count summary + per-page selector ───────── */}
          <div className="flex items-center justify-between flex-wrap gap-2 mb-2">
            <span className="text-[11px] text-[var(--ink-3)]">
              {statTotal > 0 ? (
                ja
                  ? `${statTotal.toLocaleString()}件中 ${((page - 1) * perPage + 1).toLocaleString()}–${Math.min(page * perPage, statTotal).toLocaleString()}件を表示`
                  : `${((page - 1) * perPage + 1).toLocaleString()}–${Math.min(page * perPage, statTotal).toLocaleString()} of ${statTotal.toLocaleString()}`
              ) : ""}
            </span>
            <div className="flex items-center gap-1.5">
              <span className="text-[11px] text-[var(--ink-4)]">{ja ? "表示件数:" : "Per page:"}</span>
              {[20, 50, 100].map(n => (
                <button
                  key={n}
                  onClick={() => setPer(n)}
                  className={[
                    "px-2 py-0.5 text-[11px] font-medium rounded border transition-colors",
                    perPage === n
                      ? "bg-[var(--ink)] text-ink-contrast border-[var(--ink)]"
                      : "border-[var(--line)] text-[var(--ink-2)] hover:bg-[var(--line-soft)]",
                  ].join(" ")}
                >
                  {n}
                </button>
              ))}
            </div>
          </div>

          {/* ── Victim list ───────────────────────────────────────────── */}
          {/* key reflects the active filter/page so React remounts the list
             on change, replaying the staggered entrance animation. */}
          <div
            key={`${selectedCountry}|${selectedGroup}|${selectedRange}|${page}`}
            className="space-y-0 divide-y divide-[var(--line)] stagger"
          >
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

          {/* ── Pagination ────────────────────────────────────────────── */}
          {(() => {
            const totalPages = Math.max(1, Math.ceil(statTotal / perPage));
            if (totalPages <= 1) return null;
            // Compact page window around the current page.
            const windowSize = 5;
            let start = Math.max(1, page - Math.floor(windowSize / 2));
            const end = Math.min(totalPages, start + windowSize - 1);
            start = Math.max(1, end - windowSize + 1);
            const pages = [];
            for (let p = start; p <= end; p++) pages.push(p);
            const btn = "px-2.5 py-1 text-[11px] font-medium rounded border transition-colors disabled:opacity-40 disabled:cursor-not-allowed";
            const idle = "border-[var(--line)] text-[var(--ink-2)] hover:bg-[var(--line-soft)]";
            return (
              <div className="flex items-center justify-center gap-1 mt-4 flex-wrap">
                <button className={`${btn} ${idle}`} onClick={() => goToPage(page - 1)} disabled={page <= 1}>
                  {ja ? "前へ" : "Prev"}
                </button>
                {start > 1 && (
                  <>
                    <button className={`${btn} ${idle}`} onClick={() => goToPage(1)}>1</button>
                    {start > 2 && <span className="px-1 text-[var(--ink-4)]">…</span>}
                  </>
                )}
                {pages.map(p => (
                  <button
                    key={p}
                    onClick={() => goToPage(p)}
                    className={[
                      btn,
                      p === page
                        ? "bg-[var(--ink)] text-ink-contrast border-[var(--ink)]"
                        : idle,
                    ].join(" ")}
                  >
                    {p}
                  </button>
                ))}
                {end < totalPages && (
                  <>
                    {end < totalPages - 1 && <span className="px-1 text-[var(--ink-4)]">…</span>}
                    <button className={`${btn} ${idle}`} onClick={() => goToPage(totalPages)}>{totalPages}</button>
                  </>
                )}
                <button className={`${btn} ${idle}`} onClick={() => goToPage(page + 1)} disabled={page >= totalPages}>
                  {ja ? "次へ" : "Next"}
                </button>
              </div>
            );
          })()}
          </div>
        </div>
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
            {/* Country tag (🌐 when unknown) */}
            <span className="text-[10px] px-2 py-0.5 rounded-full bg-[var(--line-soft)] text-[var(--ink-3)] font-medium inline-flex items-center gap-1">
              {(() => {
                const c = (v.country || "").trim();
                if (!c) return <>🌐 {lang === "ja" ? "国不明" : "Unknown"}</>;
                return <><CountryFlag code={c} /> {c.toUpperCase()}</>;
              })()}
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

          {/* Detail links: public ransomware.live page (clickable) + onion leak URL (shown, not clickable) */}
          {(v.publicUrl || v.post_url) && (
            <div className="space-y-1.5">
              {v.publicUrl && (
                <a
                  href={v.publicUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 text-[11px] text-[var(--ink-2)] hover:text-[var(--ink)] transition-colors"
                >
                  <ExternalLink size={12} strokeWidth={1.5} className="flex-shrink-0" />
                  {ja ? "ransomware.live で詳細を見る" : "View on ransomware.live"}
                </a>
              )}
              {v.post_url && (
                <div className="text-[11px]">
                  <span className="text-[var(--ink-4)] mr-2">{ja ? "リークサイト:" : "Leak site:"}</span>
                  <span className="font-mono text-[var(--ink-3)] bg-[var(--line-soft)] px-2 py-0.5 rounded text-[10px] break-all select-all">
                    {v.post_url}
                  </span>
                  <span className="block mt-0.5 text-[10px] text-[var(--ink-4)]">
                    {ja
                      ? "⚠ ダークウェブ(Tor)上のURLのため直接アクセス不可"
                      : "⚠ Dark web (Tor) URL — not directly accessible"}
                  </span>
                </div>
              )}
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
