// components/search/SearchPage.tsx
"use client";

import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { useState, useRef, useEffect } from "react";
import { useLang } from "@/components/LangProvider";
import { useBookmarks } from "@/hooks/useBookmarks";
import { NewsList } from "@/components/news/NewsList";
import { SavedFilters } from "@/components/news/SavedFilters";
import type { NewsArticle } from "@/lib/types";
import { X, ArrowUpDown } from "@/components/ui/Icon";

const TIME_OPTIONS = [
  { label: "2h",  value: "2" },
  { label: "24h", value: "24" },
  { label: "48h", value: "48" },
  { label: "72h", value: "72" },
  { label: "1w",  value: "168" },
  { label: "全",  value: "all" },
] as const;

const CATEGORIES = [
  { value: "general",       ja: "一般",             en: "General" },
  { value: "cybersecurity", ja: "サイバーセキュリティ", en: "Cybersecurity" },
  { value: "ai",            ja: "AI",               en: "AI" },
] as const;

const SORT_OPTIONS = [
  { value: "date",       ja: "日付順",   en: "Latest first" },
  { value: "relevance",  ja: "関連度順", en: "Most relevant" },
] as const;

interface Props {
  articles:   NewsArticle[];
  activeTags: string[];
  title:      string;
  subtitle:   string;
  lang:       string;
  allTags:    string[];   // for autocomplete
  searchMode: "semantic" | "keyword";
}

export function SearchPage({ articles, activeTags, title, subtitle, lang, allTags, searchMode }: Props) {
  const router   = useRouter();
  const pathname = usePathname();
  const params   = useSearchParams();
  const { isRead, mounted } = useBookmarks();

  const [readFilter,   setReadFilter]   = useState<"all" | "unread" | "read">("all");
  const [sourceInput,  setSourceInput]  = useState(params.get("source") ?? "");
  const [tagInput,     setTagInput]     = useState("");
  const [tagSuggestions, setTagSuggestions] = useState<string[]>([]);
  const tagRef = useRef<HTMLDivElement>(null);

  const currentHours = params.get("hours") ?? "all";
  const currentCat   = params.get("category") ?? "";
  const currentSort  = params.get("sort") ?? "date";

  function set(key: string, val: string | null) {
    const sp = new URLSearchParams(params);
    if (val === null || val === "") sp.delete(key);
    else sp.set(key, val);
    router.push(`${pathname}?${sp.toString()}`);
  }

  // Tag autocomplete
  useEffect(() => {
    if (!tagInput.trim()) { setTagSuggestions([]); return; }
    const q = tagInput.toLowerCase();
    const matches = allTags
      .filter(t => t.toLowerCase().includes(q) && !activeTags.includes(t))
      .slice(0, 8);
    setTagSuggestions(matches);
  }, [tagInput, allTags, activeTags]);

  function addTag(tag: string) {
    const sp = new URLSearchParams(params);
    sp.append("tag", tag);
    router.push(`${pathname}?${sp.toString()}`);
    setTagInput("");
    setTagSuggestions([]);
  }

  function removeTag(tag: string) {
    const sp = new URLSearchParams(params);
    const tags = sp.getAll("tag").filter(t => t !== tag);
    sp.delete("tag");
    tags.forEach(t => sp.append("tag", t));
    router.push(`${pathname}?${sp.toString()}`);
  }

  // Client-side read filter
  const filtered = mounted && readFilter !== "all"
    ? articles.filter(a => readFilter === "read" ? isRead(a.id) : !isRead(a.id))
    : articles;

  return (
    <div>
      <header className="mb-6">
        <h1 className="font-display text-3xl md:text-4xl font-semibold tracking-tight">{title}</h1>
        <p className="text-sm text-[var(--ink-3)] mt-2">{subtitle}</p>
      </header>

      {/* ── Filter bar ─────────────────────────────────────────────── */}
      <div className="mb-6 space-y-3 p-4 border hairline rounded-lg bg-[var(--line-soft)]/40">

        {/* Search mode — only meaningful with a free-text query */}
        {params.get("q") && (() => {
          // The person can force keyword mode via ?mode=keyword. If they
          // DIDN'T, but the server still used keyword (searchMode), that
          // means semantic search ran and came back with 0 results, so the
          // page silently fell back — previously the Semantic button still
          // looked "active" in that case (it only checked the URL param,
          // not what actually ran), which was confusing. Both buttons now
          // reflect searchMode (what was actually used) consistently, and
          // the fallback gets an explicit badge so it isn't silent.
          const forcedKeyword = params.get("mode") === "keyword";
          const autoFellBack = !forcedKeyword && searchMode === "keyword";
          return (
            <FilterRow label={lang === "ja" ? "検索方式" : "Mode"}>
              <Chip2
                active={searchMode === "semantic"}
                dimmed={autoFellBack}
                onClick={() => set("mode", null)}
              >
                {lang === "ja" ? "意味検索" : "Semantic"}
              </Chip2>
              <Chip2
                active={searchMode === "keyword"}
                onClick={() => set("mode", "keyword")}
              >
                {lang === "ja" ? "キーワード" : "Keyword"}
                {autoFellBack && (
                  <span className="ml-1 opacity-70">
                    {lang === "ja" ? "（自動切替）" : "(auto)"}
                  </span>
                )}
              </Chip2>
              {autoFellBack && (
                <span className="text-[11px] text-[var(--ink-4)]" title={
                  lang === "ja"
                    ? "このキーワードでは意味検索が0件だったため、自動的にキーワード検索に切り替わりました。"
                    : "Semantic search found 0 results for this query, so it fell back to keyword search automatically."
                }>
                  {lang === "ja" ? "ⓘ 意味検索が0件のため切替" : "ⓘ Semantic found nothing"}
                </span>
              )}
            </FilterRow>
          );
        })()}

        {/* Sort */}
        <FilterRow label={lang === "ja" ? "並び順" : "Sort"}>
          {SORT_OPTIONS.map(opt => (
            <Chip2
              key={opt.value}
              active={currentSort === opt.value}
              onClick={() => set("sort", opt.value === "date" ? null : opt.value)}
            >
              <ArrowUpDown size={10} strokeWidth={1.5} className="inline mr-1" />
              {lang === "ja" ? opt.ja : opt.en}
            </Chip2>
          ))}
        </FilterRow>

        {/* Time */}
        <FilterRow label={lang === "ja" ? "期間" : "Period"}>
          {TIME_OPTIONS.map(opt => (
            <Chip2
              key={opt.value}
              active={currentHours === opt.value || (opt.value === "all" && !params.get("hours"))}
              onClick={() => set("hours", opt.value === "all" ? null : opt.value)}
            >
              {opt.value === "all" ? (lang === "ja" ? "全期間" : "All") : opt.label}
            </Chip2>
          ))}
        </FilterRow>

        {/* Category */}
        <FilterRow label={lang === "ja" ? "種別" : "Category"}>
          <Chip2 active={!currentCat} onClick={() => set("category", null)}>
            {lang === "ja" ? "すべて" : "All"}
          </Chip2>
          {CATEGORIES.map(c => (
            <Chip2 key={c.value} active={currentCat === c.value}
              onClick={() => set("category", currentCat === c.value ? null : c.value)}>
              {lang === "ja" ? c.ja : c.en}
            </Chip2>
          ))}
        </FilterRow>

        {/* Tag autocomplete */}
        <FilterRow label={lang === "ja" ? "タグ" : "Tags"}>
          <div className="flex flex-wrap gap-1.5 items-center">
            {activeTags.map(tag => (
              <span key={tag} className="inline-flex items-center gap-1 px-2 py-0.5 text-[11px] font-medium rounded-full bg-[var(--ink)] text-ink-contrast">
                #{tag}
                <button onClick={() => removeTag(tag)} className="opacity-60 hover:opacity-100"><X size={9} /></button>
              </span>
            ))}
            <div className="relative" ref={tagRef}>
              <input
                value={tagInput}
                onChange={e => setTagInput(e.target.value)}
                onKeyDown={e => {
                  if (e.key === "Enter" && tagSuggestions.length > 0) { e.preventDefault(); addTag(tagSuggestions[0]); }
                  if (e.key === "Escape") setTagSuggestions([]);
                }}
                placeholder={lang === "ja" ? "タグを検索…" : "Search tags…"}
                className="text-[11px] bg-[var(--surface)] border hairline px-2.5 py-1.5 rounded-md outline-none focus:ring-1 ring-[var(--ink)] w-32"
              />
              {tagSuggestions.length > 0 && (
                <div className="absolute left-0 top-full mt-1 bg-[var(--surface)] border hairline rounded-lg shadow-lg z-20 py-1 min-w-[160px]">
                  {tagSuggestions.map(tag => (
                    <button
                      key={tag}
                      onMouseDown={e => { e.preventDefault(); addTag(tag); }}
                      className="w-full text-left px-3 py-1.5 text-[11px] hover:bg-[var(--line-soft)] text-[var(--ink-2)]"
                    >
                      #{tag}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </FilterRow>

        {/* Source */}
        <FilterRow label={lang === "ja" ? "ソース" : "Source"}>
          <form onSubmit={e => { e.preventDefault(); set("source", sourceInput.trim() || null); }} className="flex gap-1.5">
            <div className="relative">
              <input value={sourceInput} onChange={e => setSourceInput(e.target.value)}
                placeholder={lang === "ja" ? "例: Reuters" : "e.g. Reuters"}
                className="text-[11px] bg-[var(--surface)] border hairline px-3 py-1.5 rounded-md outline-none focus:ring-1 ring-[var(--ink)] pr-6 w-36" />
              {sourceInput && (
                <button type="button" onClick={() => { setSourceInput(""); set("source", null); }}
                  className="absolute right-1.5 top-1/2 -translate-y-1/2 text-[var(--ink-4)] hover:text-[var(--ink)]">
                  <X size={10} />
                </button>
              )}
            </div>
            <button type="submit" className="px-2.5 py-1.5 text-[11px] font-medium rounded-md bg-[var(--ink)] text-ink-contrast">
              {lang === "ja" ? "絞込" : "Filter"}
            </button>
          </form>
        </FilterRow>

        {/* Read filter */}
        {mounted && (
          <FilterRow label={lang === "ja" ? "既読" : "Read"}>
            {(["all", "unread", "read"] as const).map(v => (
              <Chip2 key={v} active={readFilter === v} onClick={() => setReadFilter(v)}>
                {v === "all" ? (lang === "ja" ? "すべて" : "All")
                 : v === "unread" ? (lang === "ja" ? "未読" : "Unread")
                 : (lang === "ja" ? "既読" : "Read")}
              </Chip2>
            ))}
          </FilterRow>
        )}

        {/* Active filter chips */}
        {(params.get("q") || params.get("category") || params.get("source") || params.get("hours") || params.get("sort")) && (
          <div className="flex flex-wrap gap-1.5 pt-1 border-t hairline">
            {[
              { key: "q",        label: params.get("q") ? `"${params.get("q")}"` : null },
              { key: "category", label: params.get("category") },
              { key: "source",   label: params.get("source") },
              { key: "hours",    label: params.get("hours") ? `${params.get("hours")}h` : null },
              { key: "sort",     label: params.get("sort") },
            ].filter(c => c.label).map(c => (
              <span key={c.key} className="inline-flex items-center gap-1 px-2.5 py-0.5 text-[11px] font-medium rounded-full bg-[var(--ink)] text-ink-contrast">
                {c.label}
                <button onClick={() => { if (c.key === "source") setSourceInput(""); set(c.key, null); }}
                  className="opacity-60 hover:opacity-100"><X size={9} /></button>
              </span>
            ))}
            <button onClick={() => router.push("/search")}
              className="text-[10px] text-[var(--ink-3)] hover:text-[var(--ink)] underline underline-offset-2 ml-1">
              {lang === "ja" ? "クリア" : "Clear all"}
            </button>
          </div>
        )}
      </div>

      <SavedFilters />

      {readFilter !== "all" && mounted && (
        <p className="text-[11px] text-[var(--ink-3)] mb-3">
          {filtered.length} / {articles.length} {lang === "ja" ? "件" : "results"}
        </p>
      )}

      <NewsList articles={filtered} activeTags={activeTags} searchQuery={params.get("q") ?? undefined} />
    </div>
  );
}

function FilterRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2 flex-wrap">
      <span className="text-[10px] uppercase tracking-widest text-[var(--ink-4)] w-14 flex-shrink-0">{label}</span>
      <div className="flex gap-1 flex-wrap items-center">{children}</div>
    </div>
  );
}

function Chip2({ active, dimmed, onClick, children }: { active: boolean; dimmed?: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button onClick={onClick} className={[
      "px-2.5 py-1 text-[11px] font-medium rounded-md transition-colors",
      active
        ? "bg-[var(--ink)] text-ink-contrast"
        : dimmed
        ? "text-[var(--ink-4)] ring-1 ring-inset ring-[var(--line)] bg-[var(--surface)] opacity-60"
        : "text-[var(--ink-3)] hover:bg-[var(--line-soft)] ring-1 ring-inset ring-[var(--line)] bg-[var(--surface)]",
    ].join(" ")}>
      {children}
    </button>
  );
}
