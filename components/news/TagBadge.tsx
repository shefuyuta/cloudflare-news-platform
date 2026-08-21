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

// Readable labels for tech:* tags (AI attack technique classification —
// see lib/fetcher/technique-embed.ts, the source of truth for the label
// set). Kept here as a small display-only lookup rather than importing
// the classifier module into the UI bundle.
const TECH_LABELS: Record<string, { en: string; ja: string }> = {
  "phishing-genai": { en: "Generative-AI phishing", ja: "生成AIフィッシング" },
  "deepfake":       { en: "Deepfake fraud",         ja: "ディープフェイク詐欺" },
  "model-attack":   { en: "Attack on AI model",     ja: "AIモデルへの攻撃" },
  "ai-automation":  { en: "AI-automated attack",    ja: "AIによる攻撃自動化" },
};

/** Badge for an AI attack-technique classification (tag name "tech:xxx").
 *  Display-only — translates the raw tag into a readable label. Renders
 *  nothing for a tag that isn't a recognized tech:* value (e.g. if the
 *  label set changes later without this lookup being updated). */
export function TechBadge({ tag, lang }: { tag: string; lang: string }) {
  if (!tag.startsWith("tech:")) return null;
  const key = tag.slice("tech:".length);
  const entry = TECH_LABELS[key];
  if (!entry) return null;
  return (
    <span
      className="badge bg-violet-50 text-violet-700 ring-1 ring-inset ring-violet-200"
      title={lang === "ja"
        ? "AIによる自動分類（手口分析）— 参考情報であり、正確性を保証するものではありません"
        : "Automated AI classification (technique analysis) — for reference; not guaranteed accurate"}
    >
      {lang === "ja" ? entry.ja : entry.en}
    </span>
  );
}

export function TagChip({ tag, count, onClick, active }: { tag: string; count?: number; onClick?: () => void; active?: boolean }) {
  return (
    <button
      onClick={onClick}
      className={[
        "badge font-mono min-h-[36px] sm:min-h-0",
        active
          ? "bg-[var(--ink)] text-ink-contrast ring-1 ring-inset ring-[var(--ink)]"
          : "bg-transparent text-[var(--ink-2)] ring-1 ring-inset ring-[var(--line)] hover:bg-[var(--line-soft)]",
      ].join(" ")}
    >
      #{tag}
      {count !== undefined && <span className="opacity-60 ml-1">{count}</span>}
    </button>
  );
}
