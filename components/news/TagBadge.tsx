// components/news/TagBadge.tsx
import {
  CATEGORIES, regionLabel, subcategoryLabel,
  type Category,
} from "@/lib/categories";

export function CategoryBadge({ category }: { category: Category }) {
  const c = CATEGORIES[category];
  return (
    <span className={`badge ${c.accent.bg} ${c.accent.text} ring-1 ring-inset ${c.accent.ring}`}>
      {c.label}
    </span>
  );
}

export function SubBadge({
  category, region, subcategory,
}: { category: Category; region?: string | null; subcategory?: string | null }) {
  let label: string | null = null;
  if (category === "general" && region)               label = regionLabel(region);
  else if (category === "cybersecurity" && subcategory) label = subcategoryLabel(subcategory);
  if (!label) return null;
  return (
    <span className="badge bg-[var(--line-soft)] text-[var(--ink-2)] ring-1 ring-inset ring-[var(--line)]">
      {label}
    </span>
  );
}

/**
 * Cross-cut desk badge. Shown on a card when the article's PRIMARY desk
 * differs from a desk it also belongs to (multi-label). E.g. a story
 * filed under Cybersecurity that also matches AI shows an "AI" cross
 * badge on the /cybersecurity desk, and vice-versa. Uses the accent of
 * the desk it points TO, with a small arrow to signal "also appears on".
 */
export function CrossBadge({ label, primary }: { label: string; primary: Category }) {
  const target: Category | null =
    label === "AI" ? "ai" : label === "Cyber" ? "cybersecurity" : null;
  if (!target || target === primary) return null;
  const c = CATEGORIES[target];
  return (
    <span
      className={`badge ${c.accent.bg} ${c.accent.text} ring-1 ring-inset ${c.accent.ring} opacity-80`}
      title={`Also on the ${c.label} desk`}
    >
      ↔ {c.label}
    </span>
  );
}

export function TagChip({ tag, onClick, active }: { tag: string; onClick?: () => void; active?: boolean }) {
  return (
    <button
      onClick={onClick}
      className={[
        "badge font-mono",
        active
          ? "bg-[var(--ink)] text-ink-contrast ring-1 ring-inset ring-[var(--ink)]"
          : "bg-transparent text-[var(--ink-2)] ring-1 ring-inset ring-[var(--line)] hover:bg-[var(--line-soft)]",
      ].join(" ")}
    >
      #{tag}
    </button>
  );
}
