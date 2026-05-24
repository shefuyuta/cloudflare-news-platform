// components/ransomware/RansomwareStats.tsx
"use client";

import type { VictimWithNews } from "@/lib/ransomware";

interface Props {
  victims:        VictimWithNews[];
  lang:           string;
  onFilterGroup?: (group: string | null) => void;
  onFilterAct?:   (act:   string | null) => void;
  activeGroup?:   string | null;
  activeAct?:     string | null;
}

export function RansomwareStats({
  victims, lang, onFilterGroup, onFilterAct, activeGroup, activeAct,
}: Props) {
  if (victims.length === 0) return null;
  const ja = lang === "ja";

  // ── Aggregate ─────────────────────────────────────────────────────
  const byGroup:    Record<string, number> = {};
  const byActivity: Record<string, number> = {};

  for (const v of victims) {
    const g = v.groupDisplay || v.group || "Unknown";
    byGroup[g] = (byGroup[g] ?? 0) + 1;
    const a = v.activity || (ja ? "不明" : "Unknown");
    byActivity[a] = (byActivity[a] ?? 0) + 1;
  }

  const topGroups = Object.entries(byGroup).sort((a, b) => b[1] - a[1]).slice(0, 8);
  const topActs   = Object.entries(byActivity).sort((a, b) => b[1] - a[1]).slice(0, 8);
  const maxG = topGroups[0]?.[1] ?? 1;
  const maxA = topActs[0]?.[1]   ?? 1;

  const GROUP_COLORS: Record<string, string> = {
    "LockBit 3.0":           "#dc2626",
    "LockBit":               "#dc2626",
    "ALPHV/BlackCat":        "#7c3aed",
    "Cl0p":                  "#d97706",
    "Play":                  "#0284c7",
    "Akira":                 "#059669",
    "8Base":                 "#db2777",
    "RansomHub":             "#ea580c",
    "Rhysida":               "#4f46e5",
    "Medusa":                "#0891b2",
    "Qilin":                 "#65a30d",
    "DragonForce":           "#dc2626",
    "Hunters International": "#6366f1",
  };

  // Monthly timeline
  const byMonth: Record<string, number> = {};
  for (const v of victims) {
    const d = v.discovered || "";
    if (!d) continue;
    const m = d.slice(0, 7);
    byMonth[m] = (byMonth[m] ?? 0) + 1;
  }
  const months = Object.entries(byMonth).sort(([a], [b]) => a.localeCompare(b)).slice(-12);
  const maxM = Math.max(...months.map(([, n]) => n), 1);

  const clickable = !!onFilterGroup || !!onFilterAct;

  return (
    <div className="mb-10 space-y-8">
      <h2 className="text-[11px] uppercase tracking-[0.18em] text-[var(--ink-3)]">
        {ja ? "被害統計" : "Statistics"} — {victims.length}{ja ? "件" : " victims"}
        {clickable && (
          <span className="ml-2 normal-case font-normal opacity-60">
            {ja ? "— バーをクリックで絞り込み" : "— click a bar to filter"}
          </span>
        )}
      </h2>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">

        {/* ── By group ────────────────────────────────────────────── */}
        <section className="border hairline rounded-lg p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-[11px] uppercase tracking-widest text-[var(--ink-3)]">
              {ja ? "攻撃グループ別" : "By Threat Actor"}
            </h3>
            {activeGroup && (
              <button
                onClick={() => onFilterGroup?.(null)}
                className="text-[10px] text-[var(--ink-3)] hover:text-[var(--ink)] underline underline-offset-2"
              >
                {ja ? "解除" : "Clear"}
              </button>
            )}
          </div>
          <div className="space-y-2">
            {topGroups.map(([group, cnt]) => {
              const pct     = cnt / maxG;
              const color   = GROUP_COLORS[group] ?? "#6b7280";
              const isActive = activeGroup === group;
              return (
                <button
                  key={group}
                  onClick={() => onFilterGroup?.(isActive ? null : group)}
                  className={[
                    "w-full flex items-center gap-3 rounded-md px-1 py-0.5 transition-colors text-left",
                    clickable ? "hover:bg-[var(--line-soft)] cursor-pointer" : "cursor-default",
                    isActive ? "bg-[var(--line-soft)] ring-1 ring-inset ring-[var(--line)]" : "",
                  ].join(" ")}
                >
                  <span className="text-[11px] font-medium text-[var(--ink-2)] w-36 truncate flex-shrink-0">
                    {group}
                  </span>
                  <div className="flex-1 flex items-center gap-2">
                    <div className="flex-1 h-4 bg-[var(--line-soft)] rounded-sm overflow-hidden">
                      <div
                        className="h-full rounded-sm transition-all duration-500"
                        style={{ width: `${pct * 100}%`, background: color }}
                      />
                    </div>
                    <span className="text-[11px] font-bold tabular-nums text-[var(--ink-2)] w-6 text-right flex-shrink-0">
                      {cnt}
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        </section>

        {/* ── By industry ─────────────────────────────────────────── */}
        <section className="border hairline rounded-lg p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-[11px] uppercase tracking-widest text-[var(--ink-3)]">
              {ja ? "業界別" : "By Industry"}
            </h3>
            {activeAct && (
              <button
                onClick={() => onFilterAct?.(null)}
                className="text-[10px] text-[var(--ink-3)] hover:text-[var(--ink)] underline underline-offset-2"
              >
                {ja ? "解除" : "Clear"}
              </button>
            )}
          </div>
          <div className="space-y-2">
            {topActs.map(([act, cnt]) => {
              const pct     = cnt / maxA;
              const isActive = activeAct === act;
              return (
                <button
                  key={act}
                  onClick={() => onFilterAct?.(isActive ? null : act)}
                  className={[
                    "w-full flex items-center gap-3 rounded-md px-1 py-0.5 transition-colors text-left",
                    clickable ? "hover:bg-[var(--line-soft)] cursor-pointer" : "cursor-default",
                    isActive ? "bg-[var(--line-soft)] ring-1 ring-inset ring-[var(--line)]" : "",
                  ].join(" ")}
                >
                  <span className="text-[11px] font-medium text-[var(--ink-2)] w-36 truncate flex-shrink-0">
                    {act}
                  </span>
                  <div className="flex-1 flex items-center gap-2">
                    <div className="flex-1 h-4 bg-[var(--line-soft)] rounded-sm overflow-hidden">
                      <div
                        className="h-full rounded-sm bg-[var(--ink)] transition-all duration-500"
                        style={{ width: `${pct * 100}%`, opacity: 0.4 + pct * 0.6 }}
                      />
                    </div>
                    <span className="text-[11px] font-bold tabular-nums text-[var(--ink-2)] w-6 text-right flex-shrink-0">
                      {cnt}
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        </section>
      </div>

      {/* ── Monthly timeline ─────────────────────────────────────── */}
      {months.length > 1 && (
        <section className="border hairline rounded-lg p-5">
          <h3 className="text-[11px] uppercase tracking-widest text-[var(--ink-3)] mb-4">
            {ja ? "月別被害件数" : "Monthly Victims"}
          </h3>
          <div className="flex items-end gap-2" style={{ height: "72px" }}>
            {months.map(([month, cnt]) => (
              <div key={month} className="flex-1 group relative flex flex-col items-center justify-end">
                <div
                  className="w-full rounded-sm bg-red-500 transition-all duration-500"
                  style={{ height: `${Math.max(4, (cnt / maxM) * 60)}px`, opacity: 0.6 + (cnt / maxM) * 0.4 }}
                />
                <div className="absolute bottom-full mb-1 left-1/2 -translate-x-1/2 bg-[var(--ink)] text-ink-contrast text-[10px] px-2 py-0.5 rounded opacity-0 group-hover:opacity-100 whitespace-nowrap pointer-events-none z-10">
                  {month} · {cnt}{ja ? "件" : ""}
                </div>
              </div>
            ))}
          </div>
          <div className="flex gap-2 mt-1.5">
            {months.map(([month], i) => (
              <div key={month} className="flex-1 text-center">
                {(i === 0 || i === months.length - 1 || i % 3 === 0) && (
                  <span className="text-[9px] text-[var(--ink-4)]">{month.slice(5)}</span>
                )}
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
