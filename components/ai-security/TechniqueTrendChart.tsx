// components/ai-security/TechniqueTrendChart.tsx
"use client";

/**
 * Monthly trend line chart for AI attack techniques, same visual language
 * as the ransomware page's group/industry trend charts (raw SVG, no chart
 * library, line-draw + dot-pop animations). Always shows all 4 fixed
 * technique labels (not a top-N subset) since there are only 4 and a flat
 * line at 0 is itself informative.
 */
export function TechniqueTrendChart({
  data, lang,
}: {
  data: { months: string[]; series: { label: string; points: number[]; color: string }[] };
  lang: string;
}) {
  const { months, series } = data;
  const ja = lang === "ja";

  if (!months.length) {
    return (
      <div className="text-[11px] text-[var(--ink-3)] py-8 text-center">
        {ja ? "推移データがありません" : "No trend data yet"}
      </div>
    );
  }

  const W = 640, H = 180, padL = 28, padR = 8, padT = 8, padB = 20;
  const plotW = W - padL - padR;
  const plotH = H - padT - padB;
  const maxY = Math.max(1, ...series.flatMap(s => s.points));
  const n = months.length;
  const x = (i: number) => padL + (n <= 1 ? plotW / 2 : (i / (n - 1)) * plotW);
  const y = (v: number) => padT + plotH - (v / maxY) * plotH;
  const labelStep = Math.ceil(n / 6);

  return (
    <div>
      <svg
        key={`tech-trend-${months.join(",")}`}
        viewBox={`0 0 ${W} ${H}`}
        className="w-full"
        style={{ height: "180px" }}
      >
        <line x1={padL} y1={y(0)} x2={W - padR} y2={y(0)} stroke="var(--line)" strokeWidth="0.5" />
        <line x1={padL} y1={y(maxY)} x2={W - padR} y2={y(maxY)} stroke="var(--line)" strokeWidth="0.5" strokeDasharray="2 2" />
        <text x={padL - 4} y={y(maxY) + 3} textAnchor="end" fontSize="7" fill="var(--ink-4)">{maxY}</text>
        <text x={padL - 4} y={y(0) + 3} textAnchor="end" fontSize="7" fill="var(--ink-4)">0</text>

        {months.map((m, i) =>
          i % labelStep === 0 ? (
            <text key={m} x={x(i)} y={H - 6} textAnchor="middle" fontSize="7" fill="var(--ink-4)">
              {m.slice(2)}
            </text>
          ) : null
        )}

        {series.map((s, idx) => {
          const d = s.points.map((v, i) => `${i === 0 ? "M" : "L"} ${x(i).toFixed(1)} ${y(v).toFixed(1)}`).join(" ");
          return (
            <g key={s.label}>
              <path
                d={d} pathLength={1} fill="none" stroke={s.color} strokeWidth="1.2"
                strokeOpacity="0.85" strokeLinejoin="round" strokeLinecap="round"
                className="animate-draw"
                style={{ animationDelay: `${idx * 120}ms` }}
              />
              {s.points.map((v, i) => (
                <circle
                  key={i} cx={x(i)} cy={y(v)} r="1.2" fill={s.color} fillOpacity="0.9"
                  className="animate-dot"
                  style={{ animationDelay: `${900 + idx * 120 + i * 30}ms` }}
                />
              ))}
            </g>
          );
        })}
      </svg>

      <div className="flex flex-wrap gap-x-3 gap-y-1 mt-2">
        {series.map(s => (
          <span key={s.label} className="inline-flex items-center gap-1 text-[10px] text-[var(--ink-3)]">
            <span className="inline-block w-2.5 h-2.5 rounded-sm flex-shrink-0" style={{ background: s.color }} />
            {s.label}
          </span>
        ))}
      </div>
    </div>
  );
}
