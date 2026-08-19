// components/news/FilterTabs.tsx
"use client";

import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { type Category } from "@/lib/categories";
import { TagChip } from "./TagBadge";
import { SavedFilters } from "./SavedFilters";
import { useLang } from "@/components/LangProvider";
import type { TKey } from "@/lib/i18n";

interface Props {
  /** A Category ("general"/"cybersecurity"/"ai") drives the region/subcategory
   *  sub-tabs. Any other string (e.g. "ai-security" for the AI×Security
   *  cross-view) just gets no sub-tabs — same as "ai" today. */
  category: Category | string;
  availableTags?: { name: string; count: number }[];
}

const REGION_TABS: { key: string; tKey: TKey }[] = [
  { key: "japan",  tKey: "regionJapan" },
  { key: "us",     tKey: "regionUS" },
  { key: "asia",   tKey: "regionAsia" },
  { key: "europe", tKey: "regionEurope" },
  { key: "other",  tKey: "regionOther" },
];

const SUBCATEGORY_TABS: { key: string; tKey: TKey }[] = [
  { key: "vulnerability", tKey: "subVulnerability" },
  { key: "incident",      tKey: "subIncident" },
  { key: "other",         tKey: "subOther" },
];

export function FilterTabs({ category, availableTags = [] }: Props) {
  const router    = useRouter();
  const pathname  = usePathname();
  const params    = useSearchParams();
  const { t }     = useLang();

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

  function clearTags() {
    const sp = new URLSearchParams(params);
    sp.delete("tag");
    router.push(`${pathname}?${sp.toString()}`);
  }

  const subTabs =
    category === "general"       ? REGION_TABS :
    category === "cybersecurity" ? SUBCATEGORY_TABS : [];

  const subKey: "region" | "subcategory" | null =
    category === "general" ? "region" :
    category === "cybersecurity" ? "subcategory" : null;

  const currentSub = subKey === "region" ? active.region : subKey === "subcategory" ? active.subcategory : null;

  return (
    <div className="border-b hairline pb-4 mb-2">
      {subKey && (
        <div className="flex items-center gap-1 -mb-px overflow-x-auto">
          <TabBtn
            label={t("all")}
            active={!currentSub}
            onClick={() => setParam(subKey, null)}
          />
          {subTabs.map(tab => (
            <TabBtn
              key={tab.key}
              label={t(tab.tKey)}
              active={currentSub === tab.key}
              onClick={() => setParam(subKey, tab.key)}
            />
          ))}
        </div>
      )}

      <SavedFilters />

      {availableTags.length > 0 && (
        <div className="flex items-center gap-1.5 flex-wrap mt-4">
          <span className="text-[11px] uppercase tracking-[0.18em] text-[var(--ink-3)] mr-1">
            {t("tags")}
            {active.tags.length > 1 && (
              <span className="normal-case tracking-normal opacity-70 ml-1">
                ({t("tagsAndCondition")})
              </span>
            )}
          </span>
          {availableTags.slice(0, 20).map(tag => (
            <TagChip
              key={tag.name}
              tag={tag.name}
              count={tag.count}
              active={active.tags.includes(tag.name)}
              onClick={() => toggleTag(tag.name)}
            />
          ))}
          {active.tags.length > 1 && (
            <button
              onClick={clearTags}
              className="text-[11px] text-[var(--ink-3)] hover:text-[var(--ink)] underline underline-offset-2 ml-1"
            >
              {t("clearTags")}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function TabBtn({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
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
    </button>
  );
}
