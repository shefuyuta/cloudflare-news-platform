// components/news/VolumeSummary.tsx
"use client";

const CATEGORY_COLORS: Record<string, string> = {
  general: "#1E3A8A",
  cybersecurity: "#9F1239",
  ai: "#5B21B6",
};

const CATEGORY_LABELS: Record<string, { ja: string; en: string }> = {
  general: { ja: "一般", en: "General" },
  cybersecurity: { ja: "サイバー", en: "Cyber" },
  ai: { ja: "AI", en: "AI" },
};

/**
 * Deliberately compact — a single stacked bar for the category mix plus a
 * short inline source list, both capped in height. This is NOT the
 * Dashboard: no region breakdown, no trend history, no per-source health
 * dots. The point is a glanceable "what's in the last N hours" summary
 * that fits above the fold, not a second dashboard.
 */
export function VolumeSummary({
  byCategory, bySource, total, hoursAgo, lang,
}: {
  byCategory: { category: string; cnt: number }[];
  bySource: { source: string; cnt: number }[];
  total: number;
  hoursAgo: number;
  lang: string;
}) {
  if (total === 0) return null;
  const ja = lang === "ja";

  return (
    <div className="mb-6 border hairline rounded-lg p-4">
      <div className="flex items-center justify-between mb-3">
        <p className="text-[11px] uppercase tracking-widest text-[var(--ink-3)]">
          {ja ? `過去${hoursAgo}時間の内訳` : `Last ${hoursAgo}h breakdown`}
        </p>
        <span className="text-[11px] text-[var(--ink-4)]">
          {total.toLocaleString()} {ja ? "件" : "articles"}
        </span>
      </div>

      {/* Category mix: single stacked bar, not a chart — this is meant to
         be scanned in under a second, not studied. */}
      <div className="flex h-2 rounded-full overflow-hidden mb-2">
        {byCategory.map(c => (
          <div
            key={c.category}
            style={{ width: `${(c.cnt / total) * 100}%`, background: CATEGORY_COLORS[c.category] ?? "#9CA3AF" }}
            title={`${CATEGORY_LABELS[c.category]?.[ja ? "ja" : "en"] ?? c.category}: ${c.cnt}`}
          />
        ))}
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-1 mb-3">
        {byCategory.map(c => (
          <span key={c.category} className="inline-flex items-center gap-1.5 text-[11px] text-[var(--ink-3)]">
            <span className="inline-block w-2 h-2 rounded-full flex-shrink-0" style={{ background: CATEGORY_COLORS[c.category] ?? "#9CA3AF" }} />
            {CATEGORY_LABELS[c.category]?.[ja ? "ja" : "en"] ?? c.category}
            <span className="font-medium text-[var(--ink-2)]">{c.cnt}</span>
          </span>
        ))}
      </div>

      {/* Source mix: top 6 only, inline — a hint of "who's publishing right
         now", not the Dashboard's full sortable table. */}
      {bySource.length > 0 && (
        <div className="flex flex-wrap gap-x-3 gap-y-1 pt-2 border-t hairline">
          {bySource.map(s => (
            <span key={s.source} className="text-[11px] text-[var(--ink-3)] font-mono">
              {s.source} <span className="text-[var(--ink-4)]">{s.cnt}</span>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
