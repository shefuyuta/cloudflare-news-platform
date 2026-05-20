// components/news/NewsList.tsx
"use client";

import { useState } from "react";
import type { NewsArticle } from "@/lib/types";
import { NewsCard } from "./NewsCard";
import { ExportButton } from "./ExportButton";
import { useLang } from "@/components/LangProvider";
import { useKeywordAlerts } from "@/hooks/useKeywordAlerts";

export function NewsList({ articles, activeTags = [] }: { articles: NewsArticle[]; activeTags?: string[] }) {
  const { t, lang } = useLang();
  const { keywords, matches, newCount, dismissAlerts, mounted } = useKeywordAlerts(articles);
  const [alertDismissed, setAlertDismissed] = useState(false);

  const showAlert = mounted && newCount > 0 && !alertDismissed;

  function handleDismiss() {
    dismissAlerts();
    setAlertDismissed(true);
  }

  return (
    <div>
      {/* ── Toolbar row (export + count) ── */}
      <div className="flex items-center justify-between mb-4">
        <span className="text-[11px] text-[var(--ink-3)]">
          {articles.length.toLocaleString()} {lang === "ja" ? "件" : "articles"}
        </span>
        <ExportButton />
      </div>

      {/* ── Keyword alert banner ── */}
      {showAlert && keywords.length > 0 && (
        <div className="mb-4 p-3 bg-amber-50 border border-amber-200 rounded-lg flex items-start justify-between gap-3">
          <div>
            <p className="text-sm font-medium text-amber-800">
              🔔 {newCount} {t("alertMatches")}
              {" — "}{keywords.join(", ")}
            </p>
            <ul className="mt-1.5 space-y-0.5">
              {matches.slice(0, 3).map(a => (
                <li key={a.id} className="text-[12px] text-amber-700 truncate">
                  • {a.title}
                </li>
              ))}
              {matches.length > 3 && (
                <li className="text-[12px] text-amber-600">
                  +{matches.length - 3} {lang === "ja" ? "件" : "more"}
                </li>
              )}
            </ul>
          </div>
          <button
            onClick={handleDismiss}
            className="text-amber-600 hover:text-amber-800 text-sm flex-shrink-0"
          >
            ×
          </button>
        </div>
      )}

      {!articles.length ? (
        <div className="py-20 text-center">
          <p className="font-display text-lg text-[var(--ink-3)]">{t("noArticles")}</p>
          <p className="text-sm text-[var(--ink-4)] mt-2">{t("noArticlesSub")}</p>
        </div>
      ) : (
        <div className="divide-y divide-[var(--line)]">
          {articles.map(a => (
            <NewsCard
              key={a.id}
              article={a}
              activeTags={activeTags}
            />
          ))}
        </div>
      )}
    </div>
  );
}
