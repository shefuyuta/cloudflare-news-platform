// components/news/NewsList.tsx
"use client";

import type { NewsArticle } from "@/lib/types";
import { NewsCard } from "./NewsCard";
import { useLang } from "@/components/LangProvider";

export function NewsList({ articles, activeTags = [] }: { articles: NewsArticle[]; activeTags?: string[] }) {
  const { t } = useLang();

  if (!articles.length) {
    return (
      <div className="py-20 text-center">
        <p className="font-display text-lg text-[var(--ink-3)]">{t("noArticles")}</p>
        <p className="text-sm text-[var(--ink-4)] mt-2">{t("noArticlesSub")}</p>
      </div>
    );
  }
  return (
    <div className="divide-y divide-[var(--line)]">
      {articles.map(a => <NewsCard key={a.id} article={a} activeTags={activeTags} />)}
    </div>
  );
}
