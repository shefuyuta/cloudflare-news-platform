// components/news/TagBadge.tsx
import {
  CATEGORIES, regionLabel, subcategoryLabel, IMPORTANT_THRESHOLD,
  type Category,
} from "@/lib/categories";

/** Small category badge — one of the only colored elements on a card. */
export function CategoryBadge({ category }: { category: Category }) {
  const c = CATEGORIES[category];
  return (
    <span className={`badge ${c.accent.bg} ${c.accent.text} ring-1 ring-inset ${c.accent.ring}`}>
      {c.label}
    </span>
  );
}

/** Region/subcategory badge — monochrome (only the category gets color). */
export function SubBadge({
  category, region, subcategory,
}: { category: Category; region?: string | null; subcategory?: string | null }) {
  let label: string | null = null;
  if (category === "general" && region)              label = regionLabel(region);
  else if (category === "cybersecurity" && subcategory) label = subcategoryLabel(subcategory);
  if (!label) return null;
  return (
    <span className="badge bg-[var(--line-soft)] text-[var(--ink-2)] ring-1 ring-inset ring-[var(--line)]">
      {label}
    </span>
  );
}

/** Importance badge — only shown when score crosses the threshold. */
export function ImportanceBadge({ score }: { score?: number }) {
  if (!score || score < IMPORTANT_THRESHOLD) return null;
  return (
    <span className="badge bg-amber-50 text-amber-900 ring-1 ring-inset ring-amber-200 font-mono">
      ★ {score}/10
    </span>
  );
}

/** Free-form tag — outlined, monochrome. Clickable to filter. */
export function TagChip({ tag, onClick, active }: { tag: string; onClick?: () => void; active?: boolean }) {
  return (
    <button
      onClick={onClick}
      className={[
        "badge font-mono",
        active
          ? "bg-[var(--ink)] text-white ring-1 ring-inset ring-[var(--ink)]"
          : "bg-transparent text-[var(--ink-2)] ring-1 ring-inset ring-[var(--line)] hover:bg-[var(--line-soft)]",
      ].join(" ")}
    >
      #{tag}
    </button>
  );
}
