// components/dashboard/DashboardClient.tsx
"use client";

import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import { useSearchParams } from "next/navigation";
import { Newspaper, Globe, Shield, Cpu, RefreshCw, Sparkles } from "@/components/ui/Icon";
import { useLang } from "@/components/LangProvider";

interface DashStats {
  hours: number;
  total: number;
  dbTotal: number;
  byCategory: { category: string; cnt: number }[];
  bySource: { source: string; category: string; cnt: number }[];
  trendingTags: { name: string; cnt: number }[];
  surgingTags: { group: string; recent: number; prior: number; growthPct: number | null }[];
  hourly: { hours_ago: number; jst_hour: number; cnt: number }[];
  ransomware: {
    last7d: number;
    topGroups: { g: string; cnt: number }[];
    surging: { group: string; recent: number; prior: number; growthPct: number | null }[];
    jp: {
      last7d: number;
      topGroups: { g: string; cnt: number }[];
      surging: { group: string; recent: number; prior: number; growthPct: number | null }[];
    };
  };
}

const CATEGORY_COLORS: Record<string, string> = {
  general: "var(--accent-general)",
  cybersecurity: "var(--accent-cyber)",
  ai: "var(--accent-ai)",
};

const CATEGORY_BG: Record<string, string> = {
  general: "#dbeafe",
  cybersecurity: "#ffe4e6",
  ai: "#ede9fe",
};

export function DashboardClient() {
  const { lang, t } = useLang();
  const searchParams = useSearchParams();
  const hours = parseInt(searchParams.get("hours") ?? "24", 10);

  const [stats, setStats] = useState<DashStats | null>(null);
  const [rwScope, setRwScope] = useState<"global" | "jp">("global");
  const [briefing, setBriefing] = useState<string>("");
  const [briefingLoading, setBriefingLoading] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/dashboard?hours=${hours}`)
      .then((r) => r.json())
      .then((d) => {
        setStats(d as DashStats);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [hours]);

  async function generateBriefing() {
    if (briefingLoading) return;
    setBriefingLoading(true);
    setBriefing("");
    try {
      const res = await fetch("/api/briefing", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lang }),
      });
      const data = (await res.json()) as { briefing: string };
      setBriefing(data.briefing ?? "");
    } catch {
      setBriefing(lang === "ja" ? "生成に失敗しました。" : "Generation failed.");
    } finally {
      setBriefingLoading(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-48 text-[var(--ink-3)] text-sm">
        {lang === "ja" ? "読み込み中…" : "Loading…"}
      </div>
    );
  }

  if (!stats) {
    return (
      <div className="text-sm text-[var(--ink-3)]">
        {lang === "ja" ? "データを取得できませんでした。" : "Could not load stats."}
      </div>
    );
  }

  const maxSource = Math.max(...(stats.bySource.map((s) => s.cnt)), 1);

  // Build source heatmap data: sources × categories
  const sourceMap = new Map<string, Record<string, number>>();
  for (const s of stats.bySource) {
    if (!sourceMap.has(s.source)) sourceMap.set(s.source, {});
    sourceMap.get(s.source)![s.category] = (sourceMap.get(s.source)![s.category] ?? 0) + s.cnt;
  }
  const topSources = [...sourceMap.entries()]
    .map(([source, cats]) => ({ source, total: Object.values(cats).reduce((a, b) => a + b, 0), cats }))
    .sort((a, b) => b.total - a.total)
    .slice(0, 12);

  return (
    <div className="space-y-10">
      {/* ── KPI Row ─────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <StatCard
          label={lang === "ja" ? `過去${stats.hours}h の記事数` : `Articles (last ${stats.hours}h)`}
          value={stats.total.toLocaleString()}
          icon={<Newspaper size={15} strokeWidth={1.5} />}
          sub={lang === "ja" ? `DB合計: ${stats.dbTotal}件` : `DB total: ${stats.dbTotal}`}
        />
        {stats.byCategory.map((c) => (
          <a key={c.category} href={`/${c.category}?hours=${stats.hours}`} className="block hover:opacity-80 transition-opacity">
            <StatCard
              label={catLabel(c.category, lang)}
              value={c.cnt.toLocaleString()}
              icon={catLucideIcon(c.category)}
              color={CATEGORY_COLORS[c.category]}
              sub={lang === "ja" ? "クリックで一覧" : "Click to browse"}
            />
          </a>
        ))}
      </div>

      {/* ── Ransomware pulse (last 7 days) ─────────────────────────────
         Independent of the `hours` news window — this is a "this week"
         snapshot from ransomware_victims, since the article-based stats
         above don't reflect that data at all. Global/Japan toggle switches
         between the two pre-fetched scopes without a second request. */}
      {stats.ransomware.last7d > 0 && (() => {
        const rw = rwScope === "jp" ? stats.ransomware.jp : stats.ransomware;
        return (
        <section>
          <div className="flex items-center justify-between mb-2">
            <SectionHeading as="div">
              {lang === "ja" ? "ランサムウェア動向（過去7日間）" : "Ransomware pulse (last 7 days)"}
            </SectionHeading>
            <div className="inline-flex rounded-md border hairline overflow-hidden flex-shrink-0">
              <button
                onClick={() => setRwScope("global")}
                className={[
                  "px-2.5 py-1 text-[10px] font-medium transition-colors",
                  rwScope === "global" ? "bg-[var(--ink)] text-ink-contrast" : "text-[var(--ink-3)] hover:bg-[var(--line-soft)]",
                ].join(" ")}
              >
                {lang === "ja" ? "全世界" : "Global"}
              </button>
              <button
                onClick={() => setRwScope("jp")}
                className={[
                  "px-2.5 py-1 text-[10px] font-medium transition-colors",
                  rwScope === "jp" ? "bg-[var(--ink)] text-ink-contrast" : "text-[var(--ink-3)] hover:bg-[var(--line-soft)]",
                ].join(" ")}
              >
                {lang === "ja" ? "日本" : "Japan"}
              </button>
            </div>
          </div>
          <a href={rwScope === "jp" ? "/ransomware?country=JP" : "/ransomware"} className="block hover:opacity-90 transition-opacity">
            <div className="border hairline rounded-lg p-4 flex flex-wrap items-center gap-x-8 gap-y-4">
              <div className="flex items-center gap-3">
                <Shield size={18} strokeWidth={1.5} className="text-[var(--accent-cyber)]" />
                <div>
                  <div className="text-2xl font-bold tabular-nums leading-none">{rw.last7d}</div>
                  <div className="text-[10px] uppercase tracking-widest text-[var(--ink-3)] mt-1">
                    {lang === "ja" ? "新規被害" : "New victims"}
                  </div>
                </div>
              </div>

              {rw.topGroups.length > 0 && (
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-[10px] uppercase tracking-widest text-[var(--ink-3)]">
                    {lang === "ja" ? "上位グループ" : "Top groups"}
                  </span>
                  {rw.topGroups.slice(0, 5).map(g => (
                    <span key={g.g} className="text-[11px] font-mono px-2 py-0.5 rounded-full bg-[var(--line-soft)] text-[var(--ink-2)]">
                      {g.g} <span className="opacity-60">{g.cnt}</span>
                    </span>
                  ))}
                </div>
              )}

              {rw.surging.length > 0 && (
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-[10px] uppercase tracking-widest text-[var(--ink-3)]">
                    {lang === "ja" ? "急増中" : "Surging"}
                  </span>
                  {rw.surging.map(s => (
                    <span key={s.group} className="inline-flex items-center gap-1 text-[11px] font-mono px-2 py-0.5 rounded-full bg-red-50 text-red-700 ring-1 ring-inset ring-red-200">
                      <span className="inline-block w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
                      {s.group} {s.growthPct !== null ? `+${s.growthPct}%` : (lang === "ja" ? "新規" : "new")}
                    </span>
                  ))}
                </div>
              )}

              {rwScope === "jp" && rw.last7d === 0 && (
                <span className="text-[11px] text-[var(--ink-3)]">
                  {lang === "ja" ? "過去7日間、日本関連の新規被害はありません。" : "No new Japan-related victims in the last 7 days."}
                </span>
              )}
            </div>
          </a>
        </section>
        );
      })()}

      {/* ── Hourly activity spark ───────────────────────────────────── */}
      {stats.hourly.length > 0 && (
        <section>
          <SectionHeading>
            {lang === "ja" ? "過去24時間の記事数（JST基準・1時間スロット）" : "Article volume — last 24h (JST, hourly slots)"}
          </SectionHeading>
          <div className="border hairline rounded-lg p-4">
            {/* Build 24 slots: slot 0 = current hour, slot 23 = 23h ago */}
            {(() => {
              const slots = Array.from({ length: 24 }, (_, i) => {
                const hoursAgo = 23 - i; // left=oldest, right=newest
                const rec = stats.hourly.find(h => h.hours_ago === hoursAgo);
                const cnt = rec?.cnt ?? 0;
                // JST label: current JST hour minus hoursAgo
                const nowJst = new Date(Date.now() + 9 * 3_600_000);
                const slotJst = new Date(nowJst.getTime() - hoursAgo * 3_600_000);
                const label = String(slotJst.getUTCHours()).padStart(2, "0") + "h";
                return { hoursAgo, cnt, label };
              });
              const maxCnt = Math.max(...slots.map(s => s.cnt), 1);

              return (
                <>
                  {/* Bar row */}
                  <div className="flex items-end gap-1" style={{ height: "80px" }}>
                    {slots.map(({ hoursAgo, cnt, label }) => (
                      <div
                        key={hoursAgo}
                        className="flex-1 group relative flex items-end"
                        style={{ height: "100%" }}
                      >
                        <div
                          className="w-full rounded-sm bg-[var(--ink)] transition-all duration-300"
                          style={{ height: `${Math.max(2, (cnt / maxCnt) * 76)}px`, opacity: cnt ? 0.8 : 0.1 }}
                        />
                        <div className="absolute bottom-full mb-1 left-1/2 -translate-x-1/2 bg-[var(--ink)] text-ink-contrast text-[10px] px-2 py-1 rounded opacity-0 group-hover:opacity-100 whitespace-nowrap pointer-events-none z-10 leading-tight text-center">
                          <div className="font-medium">{label} JST</div>
                          <div className="opacity-70">{cnt}件</div>
                        </div>
                      </div>
                    ))}
                  </div>
                  {/* Label row — i%6 gives evenly spaced labels left→right */}
                  <div className="flex gap-1 mt-1.5 relative">
                    {slots.map(({ hoursAgo }, i) => (
                      <div key={hoursAgo} className="flex-1 text-center">
                        {i === 0 ? (
                          <span className="text-[9px] text-[var(--ink-4)] leading-none">-23h</span>
                        ) : i === 23 ? (
                          <span className="text-[9px] text-[var(--ink-3)] leading-none font-medium">now</span>
                        ) : i % 6 === 0 ? (
                          <span className="text-[9px] text-[var(--ink-4)] leading-none">
                            {slots[i].label}
                          </span>
                        ) : null}
                      </div>
                    ))}
                  </div>
                </>
              );
            })()}
          </div>
        </section>
      )}

      {/* ── Source Heatmap ──────────────────────────────────────────── */}
      <section>
        <SectionHeading>{t("bySource")}</SectionHeading>
        <div className="border hairline rounded-lg overflow-hidden">
          {/* Header row */}
          <div className="grid grid-cols-[1fr_auto_auto_auto_auto] bg-[var(--line-soft)] px-4 py-2 text-[10px] uppercase tracking-widest text-[var(--ink-3)]">
            <span>{lang === "ja" ? "ソース" : "Source"}</span>
            <span className="w-16 text-center">General</span>
            <span className="w-16 text-center">Cyber</span>
            <span className="w-16 text-center">AI</span>
            <span className="w-12 text-right">Total</span>
          </div>
          {topSources.map(({ source, total, cats }) => (
            <a
              key={source}
              href={`/search?source=${encodeURIComponent(source)}`}
              className="grid grid-cols-[1fr_auto_auto_auto_auto] px-4 py-2.5 border-t hairline hover:bg-[var(--line-soft)] transition-colors items-center"
            >
              <span className="text-sm font-mono text-[var(--ink-2)] truncate pr-2">{source}</span>
              {(["general", "cybersecurity", "ai"] as const).map((cat) => {
                const n = cats[cat] ?? 0;
                const pct = n / maxSource;
                return (
                  <div key={cat} className="w-16 flex justify-center">
                    {n > 0 ? (
                      <div
                        className="text-[10px] font-medium px-2 py-0.5 rounded-full"
                        style={{
                          background: CATEGORY_BG[cat],
                          color: CATEGORY_COLORS[cat],
                          opacity: 0.4 + pct * 0.6,
                        }}
                      >
                        {n}
                      </div>
                    ) : (
                      <span className="text-[var(--ink-4)] text-[10px]">—</span>
                    )}
                  </div>
                );
              })}
              <span className="w-12 text-right text-sm font-medium text-[var(--ink)]">{total}</span>
            </a>
          ))}
        </div>
      </section>

      {/* ── Trending Tags ───────────────────────────────────────────── */}
      {stats.trendingTags.length > 0 && (
        <section>
          <SectionHeading>{t("trendingTags")}</SectionHeading>
          {stats.surgingTags.length > 0 && (
            <div className="flex flex-wrap gap-2 mb-3">
              {stats.surgingTags.map(s => (
                <a
                  key={s.group}
                  href={`/search?tag=${encodeURIComponent(s.group)}`}
                  className="inline-flex items-center gap-1.5 text-[11px] font-medium px-2.5 py-1 rounded-full bg-red-50 text-red-700 ring-1 ring-inset ring-red-200 hover:bg-red-100 transition-colors"
                >
                  <span className="inline-block w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
                  {s.group}
                  <span className="opacity-70">
                    {s.growthPct !== null ? `+${s.growthPct}%` : (lang === "ja" ? "新規" : "new")}
                  </span>
                </a>
              ))}
            </div>
          )}
          <div className="flex flex-wrap gap-2">
            {stats.trendingTags.map((tag) => {
              const max = stats.trendingTags[0].cnt;
              const pct = tag.cnt / max;
              const size = 11 + Math.round(pct * 6);
              return (
                <a
                  key={tag.name}
                  href={`/search?tag=${encodeURIComponent(tag.name)}`}
                  className="px-3 py-1 rounded-full border hairline font-medium transition-colors hover:bg-[var(--ink)] hover:text-ink-contrast hover:border-[var(--ink)]"
                  style={{ fontSize: `${size}px`, opacity: 0.5 + pct * 0.5 }}
                  title={`${tag.cnt} ${lang === "ja" ? "件" : "articles"}`}
                >
                  {tag.name}
                  <span className="ml-1.5 text-[10px] opacity-60">{tag.cnt}</span>
                </a>
              );
            })}
          </div>
        </section>
      )}

      {/* ── Today's Briefing ────────────────────────────────────────── */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <SectionHeading as="span">{t("todaysBriefing")}</SectionHeading>
          <button
            onClick={generateBriefing}
            disabled={briefingLoading}
            className="px-3 py-1.5 text-[11px] font-medium rounded-md bg-[var(--ink)] text-ink-contrast hover:bg-black disabled:opacity-40 transition-colors flex items-center gap-1.5"
          >
            {briefingLoading ? (
              <><RefreshCw size={12} strokeWidth={1.5} className="animate-spin" /> {lang === "ja" ? "生成中…" : "Generating…"}</>
            ) : (
              <><Sparkles size={12} strokeWidth={1.5} />{t("generateBriefing")}</>
            )}
          </button>
        </div>
        <div className="border hairline rounded-lg p-5 min-h-[80px] relative">
          {briefing ? (
            <p className="text-sm leading-relaxed text-[var(--ink)]">{briefing}</p>
          ) : (
            <p className="text-sm text-[var(--ink-3)] italic">
              {lang === "ja"
                ? "「生成」ボタンを押すと本日の記事をAIが要約します。"
                : "Press \"Generate\" to get an AI summary of today's articles."}
            </p>
          )}
          <p className="text-[10px] text-[var(--ink-4)] mt-2">
            {lang === "ja"
              ? "※ Workers AI により生成。出力は最大約300トークン（日本語で200〜250文字程度）に制限されています。"
              : "※ Generated by Workers AI. Output is capped at ~300 tokens (approx. 200–300 words)."}
          </p>
        </div>
      </section>
    </div>
  );
}

// ── Sub-components ────────────────────────────────────────────────────

function StatCard({ label, value, icon, color, sub }: {
  label: string; value: string; icon: ReactNode; color?: string; sub?: string;
}) {
  return (
    <div className="border hairline rounded-lg p-4">
      <div className="flex items-center gap-2 mb-2">
        <span className="text-[var(--ink-3)]">{icon}</span>
        <span className="text-[11px] uppercase tracking-widest text-[var(--ink-3)]">{label}</span>
      </div>
      <div className="text-2xl font-semibold" style={color ? { color } : undefined}>{value}</div>
      {sub && <div className="text-[11px] text-[var(--ink-4)] mt-1">{sub}</div>}
    </div>
  );
}

function SectionHeading({ children, as: Tag = "h2" }: { children: React.ReactNode; as?: React.ElementType }) {
  return (
    <Tag className="text-[11px] uppercase tracking-[0.18em] text-[var(--ink-3)] mb-3 block">
      {children}
    </Tag>
  );
}

function catLucideIcon(cat: string): ReactNode {
  if (cat === "general")       return <Globe   size={15} strokeWidth={1.5} />;
  if (cat === "cybersecurity") return <Shield  size={15} strokeWidth={1.5} />;
  if (cat === "ai")            return <Cpu     size={15} strokeWidth={1.5} />;
  return <Newspaper size={15} strokeWidth={1.5} />;
}

function catLabel(cat: string, lang: string): string {
  const labels: Record<string, { ja: string; en: string }> = {
    general: { ja: "一般ニュース", en: "General" },
    cybersecurity: { ja: "サイバーセキュリティ", en: "Cybersecurity" },
    ai: { ja: "AI", en: "AI" },
  };
  return labels[cat]?.[lang as "ja" | "en"] ?? cat;
}



