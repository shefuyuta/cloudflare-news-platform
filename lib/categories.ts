// lib/categories.ts
// ---------------------------------------------------------------------
// `region` and `subcategory` are stored as free-form TEXT in D1, so the
// types here are plain `string`. The constants below define the
// well-known values that the FETCHER should normalize incoming
// articles to. Anything outside the known set still renders, but
// without a filter tab.
// ---------------------------------------------------------------------

export type Category = "general" | "cybersecurity" | "ai";

/** Well-known regions for the "General" desk. */
export type KnownRegion = "japan" | "us" | "asia" | "europe" | "other";

/** Well-known subcategories for the "Cybersecurity" desk. */
export type KnownSubcategory = "vulnerability" | "incident" | "other";

export interface CategoryDef {
  slug: Category;
  label: string;
  labelJa: string;
  /** Tailwind classes for the small accent badge on cards. */
  accent: { text: string; bg: string; ring: string };
  /** Which sub-filter applies on this desk. */
  subFilterKey: "region" | "subcategory" | null;
}

export const CATEGORIES: Record<Category, CategoryDef> = {
  general: {
    slug: "general",
    label: "General",
    labelJa: "一般ニュース",
    accent: { text: "text-blue-900",   bg: "bg-blue-50",   ring: "ring-blue-200" },
    subFilterKey: "region",
  },
  cybersecurity: {
    slug: "cybersecurity",
    label: "Cybersecurity",
    labelJa: "サイバーセキュリティ",
    accent: { text: "text-rose-900",   bg: "bg-rose-50",   ring: "ring-rose-200" },
    subFilterKey: "subcategory",
  },
  ai: {
    slug: "ai",
    label: "AI",
    labelJa: "AI",
    accent: { text: "text-violet-900", bg: "bg-violet-50", ring: "ring-violet-200" },
    subFilterKey: null,
  },
};

export const REGIONS: Record<KnownRegion, { label: string; labelJa: string }> = {
  japan:  { label: "Japan",  labelJa: "日本" },
  us:     { label: "US",     labelJa: "アメリカ" },
  asia:   { label: "Asia",   labelJa: "アジア" },
  europe: { label: "Europe", labelJa: "ヨーロッパ" },
  other:  { label: "Other",  labelJa: "その他" },
};

export const SUBCATEGORIES: Record<KnownSubcategory, { label: string; labelJa: string }> = {
  vulnerability: { label: "Vulnerability", labelJa: "脆弱性" },
  incident:      { label: "Incident",      labelJa: "インシデント" },
  other:         { label: "Other",         labelJa: "その他" },
};

export const REGION_ORDER:      KnownRegion[]      = ["japan", "us", "asia", "europe", "other"];
export const SUBCATEGORY_ORDER: KnownSubcategory[] = ["vulnerability", "incident", "other"];

/** Render a region/subcategory value with a human label; falls back to raw value. */
export function regionLabel(v: string | undefined | null): string | null {
  if (!v) return null;
  return REGIONS[v as KnownRegion]?.label ?? v;
}
export function subcategoryLabel(v: string | undefined | null): string | null {
  if (!v) return null;
  return SUBCATEGORIES[v as KnownSubcategory]?.label ?? v;
}

/** Articles with importance_score >= this threshold get the "Important" badge
 *  and appear on the /important cross-cut view. Tunable. */
export const IMPORTANT_THRESHOLD = 7;
