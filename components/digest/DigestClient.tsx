// components/digest/DigestClient.tsx
"use client";

import { useState, useEffect } from "react";
import { RefreshCw } from "@/components/ui/Icon";

type DigestType = "daily" | "weekly" | "monthly";

interface Digest {
  id: string;
  type: DigestType;
  periodStart: string;
  periodEnd: string;
  contentJa: string;
  contentEn: string;
  // undefined for digests generated before this field existed.
  usedFallback?: boolean;
  generatedAt: string;
}

interface DigestsResponse {
  latest: Record<DigestType, Digest | null>;
  history: Record<DigestType, Digest[]>;
}

const TAB_LABEL: Record<DigestType, { ja: string; en: string }> = {
  daily:   { ja: "デイリー", en: "Daily" },
  weekly:  { ja: "ウィークリー", en: "Weekly" },
  monthly: { ja: "マンスリー", en: "Monthly" },
};

export function DigestClient({ lang }: { lang: string }) {
  const ja = lang === "ja";
  const [data, setData] = useState<DigestsResponse | null>(null);
  const [tab, setTab] = useState<DigestType>("daily");
  const [selected, setSelected] = useState<Digest | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/digests")
      .then(r => r.json() as Promise<DigestsResponse>)
      .then(d => { setData(d); setSelected(d.latest[tab] ?? null); })
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (data) setSelected(data.latest[tab] ?? data.history[tab]?.[0] ?? null);
  }, [tab, data]);

  const fmtDate = (iso: string) =>
    new Date(iso).toLocaleDateString(ja ? "ja-JP" : "en-US", { month: "short", day: "numeric", year: "numeric" });

  if (loading) {
    return <p className="text-sm text-[var(--ink-3)]">{ja ? "読み込み中…" : "Loading…"}</p>;
  }

  if (!data || (!data.latest.daily && !data.latest.weekly && !data.latest.monthly)) {
    return (
      <div className="py-12 text-center border hairline rounded-lg">
        <p className="text-sm text-[var(--ink-3)]">
          {ja ? "まだダイジェストが生成されていません。" : "No digests generated yet."}
        </p>
        <p className="text-[11px] text-[var(--ink-4)] mt-1">
          {ja ? "次回のcron実行（毎日9時JST）で最初のデイリーダイジェストが作成されます。" : "The first daily digest will be created at the next 9am JST cron run."}
        </p>
      </div>
    );
  }

  return (
    <div>
      {/* Tabs */}
      <div className="inline-flex rounded-md border hairline overflow-hidden mb-6">
        {(["daily", "weekly", "monthly"] as const).map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={[
              "px-4 py-1.5 text-[12px] font-medium transition-colors",
              tab === t ? "bg-[var(--ink)] text-ink-contrast" : "text-[var(--ink-3)] hover:bg-[var(--line-soft)]",
            ].join(" ")}
          >
            {ja ? TAB_LABEL[t].ja : TAB_LABEL[t].en}
          </button>
        ))}
      </div>

      {!data.latest[tab] && data.history[tab].length === 0 ? (
        <div className="py-8 text-center border hairline rounded-lg mb-6">
          <p className="text-sm text-[var(--ink-3)]">
            {ja ? `${TAB_LABEL[tab].ja}はまだありません。` : `No ${TAB_LABEL[tab].en.toLowerCase()} digest yet.`}
          </p>
          {tab === "weekly" && (
            <p className="text-[11px] text-[var(--ink-4)] mt-1">
              {ja ? "毎週金曜18時（JST）に生成されます。" : "Generated every Friday at 6pm JST."}
            </p>
          )}
          {tab === "monthly" && (
            <p className="text-[11px] text-[var(--ink-4)] mt-1">
              {ja ? "毎月最終日18時（JST）に生成されます。" : "Generated on the last day of each month at 6pm JST."}
            </p>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-[1fr_240px] gap-6">
          {/* Selected digest body */}
          <div className="border hairline rounded-lg p-6 stagger">
            {selected && (
              <>
                <div className="flex items-center justify-between mb-3">
                  <span className="text-[11px] uppercase tracking-widest text-[var(--ink-3)]">
                    {fmtDate(selected.periodStart)} – {fmtDate(selected.periodEnd)}
                  </span>
                  <span className="text-[10px] text-[var(--ink-4)] font-mono flex items-center gap-1">
                    <RefreshCw size={10} strokeWidth={1.5} />
                    {ja ? "生成日時" : "generated"}: {fmtDate(selected.generatedAt)}
                  </span>
                </div>
                {selected.usedFallback && (
                  <p className="text-[11px] text-amber-700 bg-amber-50 ring-1 ring-inset ring-amber-200 rounded-md px-2.5 py-1.5 mb-3">
                    {ja
                      ? "⚠ AIによる分析生成に失敗したため、簡易な件数サマリーのみを表示しています。"
                      : "⚠ AI-generated analysis failed for this digest — showing a plain count summary instead."}
                  </p>
                )}
                <p className="text-[15px] leading-relaxed text-[var(--ink-2)] whitespace-pre-line">
                  {ja ? selected.contentJa : selected.contentEn}
                </p>
              </>
            )}
          </div>

          {/* Archive list */}
          <div>
            <p className="text-[11px] uppercase tracking-widest text-[var(--ink-3)] mb-2">
              {ja ? "アーカイブ" : "Archive"}
            </p>
            <div className="space-y-1">
              {data.history[tab].map(d => (
                <button
                  key={d.id}
                  onClick={() => setSelected(d)}
                  className={[
                    "w-full text-left px-3 py-2 rounded-md text-[12px] transition-colors",
                    selected?.id === d.id
                      ? "bg-[var(--ink)] text-ink-contrast"
                      : "hover:bg-[var(--line-soft)] text-[var(--ink-2)]",
                  ].join(" ")}
                >
                  {fmtDate(d.periodEnd)}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
