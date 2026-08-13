// components/ransomware/RansomwareStats.tsx
"use client";

import { useState } from "react";

interface Props {
  statTotal:      number;
  byGroup:        [string, number][];
  byActivity:     [string, number][];
  byMonth:        [string, number][];
  byGroupMonth:   { months: string[]; series: { group: string; points: number[] }[] };
  showMonthly:    boolean;
  lang:           string;
  onFilterGroup?: (group: string | null) => void;
  onFilterAct?:   (act:   string | null) => void;
  activeGroup?:   string | null;
  activeAct?:     string | null;
}

export function RansomwareStats({
  statTotal, byGroup, byActivity, byMonth, byGroupMonth, showMonthly, lang, onFilterGroup, onFilterAct, activeGroup, activeAct,
}: Props) {
  // Group section can show either the total bar chart or a per-group
  // monthly trend line chart. (Hook must precede any early return.)
  const [groupView, setGroupView] = useState<"bar" | "line">("bar");

  if (statTotal === 0) return null;
  const ja = lang === "ja";

  // Aggregates are computed server-side over the full filtered set, so
  // these charts agree with the world map (no LIMIT-200 skew).
  const topGroups = byGroup;
  const topActs   = byActivity;
  const maxG = topGroups[0]?.[1] ?? 1;
  const maxA = topActs[0]?.[1]   ?? 1;

  // Keys are the raw group_name values (lowercase) as stored by
  // ransomware.live v2, e.g. "qilin", "lockbit5". Lookups normalize to
  // lowercase so this matches regardless of casing. Covers the common /
  // high-volume groups; anything else falls back to a palette color.
  const GROUP_COLORS: Record<string, string> = {
    qilin:        "#65a30d",
    thegentlemen: "#be123c",
    dragonforce:  "#dc2626",
    incransom:    "#0891b2",
    akira:        "#059669",
    lockbit5:     "#b91c1c",
    lockbit:      "#b91c1c",
    lockbit3:     "#b91c1c",
    nightspire:   "#7c3aed",
    safepay:      "#0284c7",
    ransomhub:    "#ea580c",
    play:         "#2563eb",
    medusa:       "#0e7490",
    rhysida:      "#4f46e5",
    cl0p:         "#d97706",
    clop:         "#d97706",
    alphv:        "#7c3aed",
    blackcat:     "#7c3aed",
    "8base":      "#db2777",
    hunters:      "#6366f1",
    inc:          "#0891b2",
  };

  const months = byMonth;
  const maxM = Math.max(...months.map(([, n]) => n), 1);

  const clickable = !!onFilterGroup || !!onFilterAct;

  return (
    <div className="mb-10 space-y-8">
      <h2 className="text-[11px] uppercase tracking-[0.18em] text-[var(--ink-3)]">
        {ja ? "被害統計" : "Statistics"} — {statTotal}{ja ? "件" : " victims"}
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
            <div className="flex items-center gap-2">
              {activeGroup && (
                <button
                  onClick={() => onFilterGroup?.(null)}
                  className="text-[10px] text-[var(--ink-3)] hover:text-[var(--ink)] underline underline-offset-2"
                >
                  {ja ? "解除" : "Clear"}
                </button>
              )}
              {/* Bar / line toggle */}
              <div className="inline-flex rounded-md border hairline overflow-hidden">
                <button
                  onClick={() => setGroupView("bar")}
                  className={[
                    "px-2 py-0.5 text-[10px] transition-colors",
                    groupView === "bar" ? "bg-[var(--ink)] text-ink-contrast" : "text-[var(--ink-3)] hover:bg-[var(--line-soft)]",
                  ].join(" ")}
                >
                  {ja ? "件数" : "Total"}
                </button>
                <button
                  onClick={() => setGroupView("line")}
                  className={[
                    "px-2 py-0.5 text-[10px] transition-colors",
                    groupView === "line" ? "bg-[var(--ink)] text-ink-contrast" : "text-[var(--ink-3)] hover:bg-[var(--line-soft)]",
                  ].join(" ")}
                >
                  {ja ? "推移" : "Trend"}
                </button>
              </div>
            </div>
          </div>
          {groupView === "bar" ? (
          <div className="space-y-2">
            {topGroups.map(([group, cnt]) => {
              const pct     = cnt / maxG;
              const color   = GROUP_COLORS[group.toLowerCase()] ?? "#6b7280";
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
                        className="h-full rounded-sm transition-all duration-500 animate-bar"
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
          ) : (
            <GroupTrendChart data={byGroupMonth} colors={GROUP_COLORS} ja={ja} />
          )}
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
                        className="h-full rounded-sm bg-[var(--ink)] transition-all duration-500 animate-bar"
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
      {showMonthly && months.length > 1 && (
        <section className="border hairline rounded-lg p-5">
          <h3 className="text-[11px] uppercase tracking-widest text-[var(--ink-3)] mb-4">
            {ja ? "月別被害件数（推移）" : "Monthly Victims (trend)"}
          </h3>
          {(() => {
            const W = 640, H = 96, PAD = 6;
            const n = months.length;
            const stepX = n > 1 ? (W - PAD * 2) / (n - 1) : 0;
            const pts = months.map(([, cnt], i) => {
              const x = PAD + i * stepX;
              const y = H - PAD - (cnt / maxM) * (H - PAD * 2);
              return { x, y };
            });
            const line = pts.map((p, i) => `${i === 0 ? "M" : "L"}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ");
            const area = `${line} L${pts[pts.length - 1].x.toFixed(1)},${H - PAD} L${pts[0].x.toFixed(1)},${H - PAD} Z`;
            return (
              <svg key={`monthly-${months.map(m=>m[0]).join(",")}`} viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ height: "96px" }} preserveAspectRatio="none">
                <path d={area} fill="rgb(239 68 68 / 0.10)" className="animate-area" />
                <path d={line} pathLength={1} className="animate-draw" fill="none" stroke="rgb(239 68 68)" strokeWidth={1.5}
                      strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
                {pts.map((p, i) => (
                  <g key={i}>
                    <circle cx={p.x} cy={p.y} r={2.5} fill="rgb(239 68 68)" className="animate-dot" style={{ animationDelay: `${700 + i * 40}ms` }} />
                    <title>{`${months[i][0]} · ${months[i][1]}${ja ? "件" : ""}`}</title>
                  </g>
                ))}
              </svg>
            );
          })()}
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

/**
 * Per-group monthly trend as an SVG multi-line chart. One line per group
 * (top-5 + Other, already shaped server-side), points aligned to `months`.
 * Raw SVG (no chart lib) to match the rest of this file. A small legend
 * maps colors to groups. X axis = months, Y = victim count that month.
 */
function GroupTrendChart({
  data, colors, ja,
}: {
  data: { months: string[]; series: { group: string; points: number[] }[] };
  colors: Record<string, string>;
  ja: boolean;
}) {
  const { months, series } = data;
  if (!months.length || !series.length) {
    return (
      <div className="text-[11px] text-[var(--ink-3)] py-8 text-center">
        {ja ? "推移データがありません" : "No trend data"}
      </div>
    );
  }

  const W = 320, H = 140, padL = 24, padR = 8, padT = 8, padB = 20;
  const plotW = W - padL - padR;
  const plotH = H - padT - padB;
  const maxY = Math.max(1, ...series.flatMap(s => s.points));
  const n = months.length;
  const x = (i: number) => padL + (n <= 1 ? plotW / 2 : (i / (n - 1)) * plotW);
  const y = (v: number) => padT + plotH - (v / maxY) * plotH;

  const fallback = ["#0284c7", "#7c3aed", "#059669", "#dc2626", "#d97706", "#0891b2"];
  const colorFor = (group: string, idx: number) => colors[group.toLowerCase()] ?? fallback[idx % fallback.length];

  // Show at most ~6 month labels to avoid crowding.
  const labelStep = Math.ceil(n / 6);

  return (
    <div>
      <svg key={`trend-${months.join(",")}-${series.map(s=>s.group).join(",")}`} viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ height: "140px" }}>
        {/* Y grid: 0 and max */}
        <line x1={padL} y1={y(0)} x2={W - padR} y2={y(0)} stroke="var(--line)" strokeWidth="0.5" />
        <line x1={padL} y1={y(maxY)} x2={W - padR} y2={y(maxY)} stroke="var(--line)" strokeWidth="0.5" strokeDasharray="2 2" />
        <text x={padL - 4} y={y(maxY) + 3} textAnchor="end" fontSize="7" fill="var(--ink-4)">{maxY}</text>
        <text x={padL - 4} y={y(0) + 3} textAnchor="end" fontSize="7" fill="var(--ink-4)">0</text>

        {/* Month labels */}
        {months.map((m, i) =>
          i % labelStep === 0 ? (
            <text key={m} x={x(i)} y={H - 6} textAnchor="middle" fontSize="7" fill="var(--ink-4)">
              {m.slice(2)}
            </text>
          ) : null
        )}

        {/* Lines */}
        {series.map((s, idx) => {
          const d = s.points.map((v, i) => `${i === 0 ? "M" : "L"} ${x(i).toFixed(1)} ${y(v).toFixed(1)}`).join(" ");
          const color = colorFor(s.group, idx);
          return (
            <g key={s.group}>
              <path
                d={d} pathLength={1} fill="none" stroke={color} strokeWidth="1"
                strokeOpacity="0.85" strokeLinejoin="round" strokeLinecap="round"
                className="animate-draw"
                style={{ animationDelay: `${idx * 120}ms` }}
              />
              {s.points.map((v, i) => (
                <circle
                  key={i} cx={x(i)} cy={y(v)} r="1" fill={color} fillOpacity="0.9"
                  className="animate-dot"
                  style={{ animationDelay: `${900 + idx * 120 + i * 30}ms` }}
                />
              ))}
            </g>
          );
        })}
      </svg>

      {/* Legend */}
      <div className="flex flex-wrap gap-x-3 gap-y-1 mt-2">
        {series.map((s, idx) => (
          <span key={s.group} className="inline-flex items-center gap-1 text-[10px] text-[var(--ink-3)]">
            <span className="inline-block w-2.5 h-2.5 rounded-sm flex-shrink-0" style={{ background: colorFor(s.group, idx) }} />
            <span className="truncate max-w-[110px]">{s.group}</span>
          </span>
        ))}
      </div>
    </div>
  );
}
