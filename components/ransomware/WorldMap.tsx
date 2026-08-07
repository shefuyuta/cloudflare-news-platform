"use client";

import { useState } from "react";
import { WORLD_PATHS, WORLD_VIEWBOX } from "@/lib/worldPaths";

interface Props {
  /** Victim counts keyed by ISO 3166-1 alpha-2 (e.g. { US: 40, JP: 3 }). */
  counts: Record<string, number>;
  lang: string;
  /** Called when a country is clicked (to filter). */
  onSelectCountry?: (iso: string) => void;
  selectedCountry?: string;
}

/**
 * Choropleth world map of ransomware victim counts by country. Colours
 * scale with victim count (log-ish steps so a few huge countries don't
 * flatten everything else). Countries with zero victims render faint.
 *
 * Embedded SVG paths (lib/worldPaths.ts) — no external map dependency.
 */
export function WorldMap({ counts, lang, onSelectCountry, selectedCountry }: Props) {
  const ja = lang === "ja";
  const [hover, setHover] = useState<{ iso: string; count: number; x: number; y: number } | null>(null);

  const max = Math.max(1, ...Object.values(counts));

  // Map a count to a red intensity. Zero → very faint grey.
  function fill(iso: string): string {
    const c = counts[iso] ?? 0;
    if (c === 0) return "var(--line-soft)";
    // Perceptual steps: normalise on sqrt so mid counts stay visible.
    const t = Math.sqrt(c) / Math.sqrt(max);
    const light = 92 - t * 55;          // 92% (faint) → 37% (deep)
    return `hsl(0 72% ${light}%)`;
  }

  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  const topN = Object.entries(counts)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 5);

  return (
    <section className="border hairline rounded-lg p-5">
      <div className="flex items-baseline justify-between mb-3">
        <h3 className="text-[11px] uppercase tracking-widest text-[var(--ink-3)]">
          {ja ? "国別被害マップ" : "Victims by Country"}
        </h3>
        <span className="text-[11px] text-[var(--ink-4)]">
          {ja ? `${total.toLocaleString()}件 / ${Object.keys(counts).length}カ国`
              : `${total.toLocaleString()} · ${Object.keys(counts).length} countries`}
        </span>
      </div>

      <div className="relative">
        <svg
          viewBox={WORLD_VIEWBOX}
          className="w-full"
          style={{ height: "auto", maxHeight: "420px" }}
          role="img"
          aria-label={ja ? "国別ランサムウェア被害マップ" : "Ransomware victims by country map"}
        >
          {Object.entries(WORLD_PATHS).map(([iso, d]) => {
            const c = counts[iso] ?? 0;
            const isSel = selectedCountry === iso;
            return (
              <path
                key={iso}
                d={d}
                fill={fill(iso)}
                stroke={isSel ? "var(--ink)" : "var(--surface)"}
                strokeWidth={isSel ? 1.2 : 0.3}
                style={{ cursor: c > 0 && onSelectCountry ? "pointer" : "default", transition: "fill .2s" }}
                onMouseEnter={(e) => {
                  const rect = (e.currentTarget.ownerSVGElement as SVGSVGElement).getBoundingClientRect();
                  setHover({ iso, count: c, x: e.clientX - rect.left, y: e.clientY - rect.top });
                }}
                onMouseMove={(e) => {
                  const rect = (e.currentTarget.ownerSVGElement as SVGSVGElement).getBoundingClientRect();
                  setHover({ iso, count: c, x: e.clientX - rect.left, y: e.clientY - rect.top });
                }}
                onMouseLeave={() => setHover(null)}
                onClick={() => { if (c > 0 && onSelectCountry) onSelectCountry(iso); }}
              />
            );
          })}
        </svg>

        {hover && (
          <div
            className="absolute pointer-events-none bg-[var(--ink)] text-ink-contrast text-[11px] px-2 py-1 rounded whitespace-nowrap z-10"
            style={{ left: hover.x + 8, top: hover.y + 8 }}
          >
            {hover.iso} · {hover.count}{ja ? "件" : hover.count === 1 ? " victim" : " victims"}
          </div>
        )}
      </div>

      {/* Continuous colour scale + top countries */}
      {topN.length > 0 && (
        <div className="mt-3 space-y-2">
          {/* Gradient scale: faint (few) → deep (many) */}
          <div className="flex items-center gap-2">
            <span className="text-[10px] text-[var(--ink-4)]">{ja ? "少" : "Low"}</span>
            <div
              className="flex-1 h-2 rounded-sm"
              style={{
                background: `linear-gradient(to right, hsl(0 72% 92%), hsl(0 72% 64%), hsl(0 72% 37%))`,
              }}
            />
            <span className="text-[10px] text-[var(--ink-4)]">
              {ja ? `多 (最大${max})` : `High (max ${max})`}
            </span>
          </div>
          {/* Top countries */}
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-[var(--ink-3)]">
            {topN.map(([iso, c]) => (
              <span key={iso} className="inline-flex items-center gap-1.5">
                <span className="inline-block w-2.5 h-2.5 rounded-sm" style={{ background: fill(iso) }} />
                {iso} · {c}
              </span>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
