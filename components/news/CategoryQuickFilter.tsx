// components/news/CategoryQuickFilter.tsx
"use client";

import { useRouter, usePathname, useSearchParams } from "next/navigation";

const CATEGORIES = [
  { key: "", labelJa: "すべて", labelEn: "All" },
  { key: "general", labelJa: "一般", labelEn: "General" },
  { key: "cybersecurity", labelJa: "サイバー", labelEn: "Cyber" },
  { key: "ai", labelJa: "AI", labelEn: "AI" },
] as const;

/**
 * Homepage-only category toggle. Deliberately lighter than FilterTabs (no
 * region/subcategory sub-tabs, no tag list) — the homepage mixes all three
 * categories by design (see hoursAgo:12), so this is just a quick "narrow
 * to one desk" filter, not the full desk-page filter UI.
 */
export function CategoryQuickFilter({ lang }: { lang: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const active = searchParams.get("category") ?? "";
  const ja = lang === "ja";

  function select(key: string) {
    const sp = new URLSearchParams(searchParams.toString());
    if (key) sp.set("category", key); else sp.delete("category");
    sp.delete("page"); // reset pagination when switching category
    router.push(`${pathname}?${sp.toString()}`);
  }

  return (
    <div className="flex items-center gap-1.5 mb-4">
      {CATEGORIES.map(c => (
        <button
          key={c.key}
          onClick={() => select(c.key)}
          className={[
            "px-3 py-1 text-[12px] font-medium rounded-full border transition-colors min-h-[36px] sm:min-h-0",
            active === c.key
              ? "bg-[var(--ink)] text-ink-contrast border-[var(--ink)]"
              : "border-[var(--line)] text-[var(--ink-2)] hover:bg-[var(--line-soft)]",
          ].join(" ")}
        >
          {ja ? c.labelJa : c.labelEn}
        </button>
      ))}
    </div>
  );
}
