export type NewsArticle = {
  id: string;
  title: string;
  summary?: string;
  content?: string;

  category:
    | "general"
    | "cybersecurity"
    | "ai";

  subcategory?: string;

  region?: string;

  tags: string[];

  source: string;

  url: string;

  publishedAt: string;

  importanceScore?: number;
};
