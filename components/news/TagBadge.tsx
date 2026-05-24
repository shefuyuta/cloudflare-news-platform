// components/news/TagBadge.tsx
import {
  CATEGORIES, regionLabel, subcategoryLabel, IMPORTANT_THRESHOLD,
  type Category,
} from "@/lib/categories";
import { Star } from "@/components/ui/Icon";

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

export function ImportanceBadge({ score }: { score?: number }) {
  if (!score || score < IMPORTANT_THRESHOLD) return null;
  return (
    <span className="badge bg-amber-50 text-amber-900 ring-1 ring-inset ring-amber-200 font-mono flex items-center gap-1">
      <Star size={10} strokeWidth={1.5} className="fill-amber-400 text-amber-400" />
      {score}/10
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
