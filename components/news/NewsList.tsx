// components/news/NewsList.tsx
import type { NewsArticle } from "@/lib/types";
import { NewsCard } from "./NewsCard";

export function NewsList({ articles, activeTags = [] }: { articles: NewsArticle[]; activeTags?: string[] }) {
  if (!articles.length) {
    return (
      <div className="py-20 text-center">
        <p className="font-display text-lg text-[var(--ink-3)]">No articles match the current filters.</p>
        <p className="text-sm text-[var(--ink-4)] mt-2">Try clearing tags or switching tabs.</p>
      </div>
    );
  }
  return (
    <div className="divide-y divide-[var(--line)]">
      {articles.map(a => <NewsCard key={a.id} article={a} activeTags={activeTags} />)}
    </div>
  );
}
