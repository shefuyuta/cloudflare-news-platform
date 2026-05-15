import { NewsCard } from "./NewsCard";

const mockArticles = [
  {
    title: "Critical SharePoint Vulnerability Exploited",
    source: "The Hacker News",
    tags: ["RCE", "Critical", "Microsoft"],
    url: "https://thehackernews.com/"
  },
  {
    title: "OpenAI Announces New Enterprise Features",
    source: "OpenAI",
    tags: ["AI", "LLM"],
    url: "https://openai.com/news/"
  }
];

export function NewsGrid() {
  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-2 xl:grid-cols-3">
      {mockArticles.map((article) => (
        <NewsCard
          key={article.title}
          article={article}
        />
      ))}
    </div>
  );
}
