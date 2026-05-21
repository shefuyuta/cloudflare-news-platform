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
  hourly: { hours_ago: number; jst_hour: number; cnt: number }[];
  importanceDist: { high: number; medium: number; low: number } | null;
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

  const imp = stats.importanceDist;
  const impTotal = imp ? (imp.high + imp.medium + imp.low) || 1 : 1;

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
          <StatCard
            key={c.category}
            label={catLabel(c.category, lang)}
            value={c.cnt.toLocaleString()}
            icon={catLucideIcon(c.category)}
            color={CATEGORY_COLORS[c.category]}
          />
        ))}
      </div>

      {/* ── Importance distribution ─────────────────────────────────── */}
      {imp && (
        <section>
          <SectionHeading>{t("byCategory")}</SectionHeading>
          <div className="flex gap-3 flex-wrap">
            {[
              { label: lang === "ja" ? "重要 (7-10)" : "High (7-10)", val: imp.high, color: "#9f1239" },
              { label: lang === "ja" ? "中 (4-6)" : "Medium (4-6)", val: imp.medium, color: "#1e3a8a" },
              { label: lang === "ja" ? "低 (0-3)" : "Low (0-3)", val: imp.low, color: "#71717a" },
            ].map((b) => (
              <div key={b.label} className="flex-1 min-w-[120px] border hairline rounded-lg p-4">
                <div className="text-[11px] font-medium uppercase tracking-widest mb-2" style={{ color: b.color }}>
                  {b.label}
                </div>
                <div className="text-2xl font-semibold">{b.val}</div>
                <div className="mt-2 h-1.5 bg-[var(--line-soft)] rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all duration-700"
                    style={{ width: `${(b.val / impTotal) * 100}%`, background: b.color }}
                  />
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

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
                        <div className="absolute bottom-full mb-1 left-1/2 -translate-x-1/2 bg-[var(--ink)] text-white text-[10px] px-1.5 py-0.5 rounded opacity-0 group-hover:opacity-100 whitespace-nowrap pointer-events-none z-10">
                          {label} · {cnt}
                        </div>
                      </div>
                    ))}
                  </div>
                  {/* Label row */}
                  <div className="flex gap-1 mt-1.5">
                    {slots.map(({ hoursAgo, label }) => (
                      <div key={hoursAgo} className="flex-1 text-center">
                        {hoursAgo % 6 === 0 && (
                          <span className="text-[9px] text-[var(--ink-4)] leading-none">{label}</span>
                        )}
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
            <div
              key={source}
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
            </div>
          ))}
        </div>
      </section>

      {/* ── Trending Tags ───────────────────────────────────────────── */}
      {stats.trendingTags.length > 0 && (
        <section>
          <SectionHeading>{t("trendingTags")}</SectionHeading>
          <div className="flex flex-wrap gap-2">
            {stats.trendingTags.map((tag, i) => {
              const max = stats.trendingTags[0].cnt;
              const pct = tag.cnt / max;
              const size = 11 + Math.round(pct * 6); // 11–17px
              return (
                <span
                  key={tag.name}
                  className="px-3 py-1 rounded-full border hairline font-medium transition-colors hover:bg-[var(--line-soft)] cursor-default"
                  style={{ fontSize: `${size}px`, opacity: 0.5 + pct * 0.5 }}
                  title={`${tag.cnt} ${lang === "ja" ? "件" : "articles"}`}
                >
                  {tag.name}
                  <span className="ml-1.5 text-[10px] text-[var(--ink-3)]">{tag.cnt}</span>
                </span>
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
            className="px-3 py-1.5 text-[11px] font-medium rounded-md bg-[var(--ink)] text-white hover:bg-black disabled:opacity-40 transition-colors flex items-center gap-1.5"
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
        </div>
      </section>

      {/* ── Briefing Delivery ───────────────────────────────────────── */}
      <BriefingDelivery lang={lang} />
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

function BriefingDelivery({ lang }: { lang: string }) {
  const [webhookUrl, setWebhookUrl] = useState("");
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [sending, setSending] = useState(false);

  async function send(target: "slack" | "email") {
    if (sending) return;
    setSending(true);
    setStatus(null);
    try {
      const body =
        target === "slack"
          ? { webhookUrl, lang }
          : { email, lang };
      const res = await fetch("/api/slack-briefing", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (res.ok) {
        setStatus(lang === "ja" ? "✓ 送信しました" : "✓ Sent successfully");
      } else {
        setStatus(lang === "ja" ? "送信に失敗しました" : "Delivery failed");
      }
    } catch {
      setStatus(lang === "ja" ? "エラーが発生しました" : "An error occurred");
    } finally {
      setSending(false);
      setTimeout(() => setStatus(null), 5000);
    }
  }

  return (
    <section>
      <h2 className="text-[11px] uppercase tracking-[0.18em] text-[var(--ink-3)] mb-3">
        {lang === "ja" ? "ブリーフィング配信" : "Briefing Delivery"}
      </h2>
      <div className="border hairline rounded-lg p-5 space-y-4">
        {/* Slack */}
        <div>
          <label className="block text-[11px] font-medium uppercase tracking-wider text-[var(--ink-3)] mb-1.5">
            Slack Webhook URL
          </label>
          <div className="flex gap-2">
            <input
              type="url"
              value={webhookUrl}
              onChange={(e) => setWebhookUrl(e.target.value)}
              placeholder="https://hooks.slack.com/services/…"
              className="flex-1 text-sm bg-[var(--line-soft)] px-3 py-2 rounded-md outline-none focus:ring-1 ring-[var(--ink)]"
            />
            <button
              onClick={() => send("slack")}
              disabled={!webhookUrl || sending}
              className="px-3 py-2 text-[11px] font-medium rounded-md ring-1 ring-inset ring-[var(--line)] text-[var(--ink-2)] hover:bg-[var(--line-soft)] disabled:opacity-40 transition-colors"
            >
              {lang === "ja" ? "Slackへ送信" : "Send to Slack"}
            </button>
          </div>
        </div>

        {/* Email */}
        <div>
          <label className="block text-[11px] font-medium uppercase tracking-wider text-[var(--ink-3)] mb-1.5">
            {lang === "ja" ? "メールアドレス (Resend)" : "Email Address (via Resend)"}
          </label>
          <div className="flex gap-2">
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="your@email.com"
              className="flex-1 text-sm bg-[var(--line-soft)] px-3 py-2 rounded-md outline-none focus:ring-1 ring-[var(--ink)]"
            />
            <button
              onClick={() => send("email")}
              disabled={!email || sending}
              className="px-3 py-2 text-[11px] font-medium rounded-md ring-1 ring-inset ring-[var(--line)] text-[var(--ink-2)] hover:bg-[var(--line-soft)] disabled:opacity-40 transition-colors"
            >
              {lang === "ja" ? "メール送信" : "Send Email"}
            </button>
          </div>
          <p className="text-[10px] text-[var(--ink-4)] mt-1.5">
            {lang === "ja"
              ? "事前に wrangler.toml へ RESEND_API_KEY と BRIEFING_FROM を設定してください。"
              : "Requires RESEND_API_KEY and BRIEFING_FROM set in wrangler.toml."}
          </p>
        </div>

        {status && (
          <p className={`text-sm font-medium ${status.includes("✓") ? "text-emerald-600" : "text-red-600"}`}>
            {status}
          </p>
        )}
      </div>
    </section>
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
    cybersecurity: { ja: "サイバー", en: "Cybersecurity" },
    ai: { ja: "AI", en: "AI" },
  };
  return labels[cat]?.[lang as "ja" | "en"] ?? cat;
}



