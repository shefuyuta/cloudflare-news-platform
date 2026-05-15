// components/news/FilterTabs.tsx
"use client";

import { useRouter, usePathname, useSearchParams } from "next/navigation";
import {
  REGIONS, SUBCATEGORIES, REGION_ORDER, SUBCATEGORY_ORDER,
  type Category, type KnownRegion, type KnownSubcategory,
} from "@/lib/categories";
import { TagChip } from "./TagBadge";

interface Props {
  category: Category;
  /** Optional pre-computed tag list for chip filtering. */
  availableTags?: string[];
}

/** Sub-category tabs + active tag filters. URL is the source of truth:
 *  ?region=japan  or  ?subcategory=vulnerability  or  ?tag=foo&tag=bar */
export function FilterTabs({ category, availableTags = [] }: Props) {
  const router    = useRouter();
  const pathname  = usePathname();
  const params    = useSearchParams();

  const active = {
    region:      params.get("region"),
    subcategory: params.get("subcategory"),
    tags:        params.getAll("tag"),
  };

  function setParam(key: "region" | "subcategory", value: string | null) {
    const sp = new URLSearchParams(params);
    if (value && sp.get(key) !== value) sp.set(key, value);
    else sp.delete(key);
    router.push(`${pathname}?${sp.toString()}`);
  }

  function toggleTag(tag: string) {
    const sp = new URLSearchParams(params);
    const existing = sp.getAll("tag");
    sp.delete("tag");
    const next = existing.includes(tag) ? existing.filter(t => t !== tag) : [...existing, tag];
    next.forEach(t => sp.append("tag", t));
    router.push(`${pathname}?${sp.toString()}`);
  }

  /* Render sub-category tabs based on category --------------------- */
  const subTabs =
    category === "general"
      ? REGION_ORDER.map(r => ({ key: r as string, label: REGIONS[r].label, labelJa: REGIONS[r].labelJa }))
      : category === "cybersecurity"
      ? SUBCATEGORY_ORDER.map(s => ({ key: s as string, label: SUBCATEGORIES[s].label, labelJa: SUBCATEGORIES[s].labelJa }))
      : [];

  const subKey: "region" | "subcategory" | null =
    category === "general" ? "region" :
    category === "cybersecurity" ? "subcategory" : null;

  const currentSub = subKey === "region" ? active.region : subKey === "subcategory" ? active.subcategory : null;

  return (
    <div className="border-b hairline pb-4 mb-2">
      {subKey && (
        <div className="flex items-center gap-1 -mb-px overflow-x-auto">
          <TabBtn
            label="All"
            labelJa="すべて"
            active={!currentSub}
            onClick={() => setParam(subKey, null)}
          />
          {subTabs.map(t => (
            <TabBtn
              key={t.key}
              label={t.label}
              labelJa={t.labelJa}
              active={currentSub === t.key}
              onClick={() => setParam(subKey, t.key)}
            />
          ))}
        </div>
      )}

      {availableTags.length > 0 && (
        <div className="flex items-center gap-1.5 flex-wrap mt-4">
          <span className="text-[11px] uppercase tracking-[0.18em] text-[var(--ink-3)] mr-1">Tags</span>
          {availableTags.slice(0, 20).map(t => (
            <TagChip key={t} tag={t} active={active.tags.includes(t)} onClick={() => toggleTag(t)} />
          ))}
        </div>
      )}
    </div>
  );
}

function TabBtn({ label, labelJa, active, onClick }: { label: string; labelJa: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={[
        "px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors whitespace-nowrap",
        active
          ? "border-[var(--ink)] text-[var(--ink)]"
          : "border-transparent text-[var(--ink-3)] hover:text-[var(--ink-2)]",
      ].join(" ")}
    >
      {label}
      <span className="ml-1.5 text-[11px] text-[var(--ink-4)] font-normal">{labelJa}</span>
    </button>
  );
}
