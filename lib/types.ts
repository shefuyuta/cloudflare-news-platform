// lib/types.ts
import type { Category } from "./categories";

/** From the existing schema — field names match D1 columns in camelCase. */
export type NewsArticle = {
  id: string;
  title: string;
  summary?: string;
  content?: string;
  category: Category;             // "general" | "cybersecurity" | "ai"
  subcategory?: string;           // free-form (well-known values in categories.ts)
  region?: string;                // free-form (well-known values in categories.ts)
  tags: string[];
  source: string;
  url: string;
  publishedAt: string;            // ISO 8601 string
  importanceScore?: number;       // 0–10
};

/** Cloudflare bindings exposed via getCloudflareContext().env */
export interface Env {
  DB: D1Database;
  VECTORIZE: VectorizeIndex;
  AI: Ai;
}

/** Filters the UI can send to /api/articles. */
export interface ArticleQuery {
  category?: Category;
  region?: string;
  subcategory?: string;
  tags?: string[];
  source?: string;          // filter by exact source name
  q?: string;
  important?: boolean;
  hoursAgo?: number;
  noTimeLimit?: boolean;    // bypass hoursAgo — used by /search
  limit?: number;
  offset?: number;
}

/** Source citation attached to AI assistant messages. */
export interface Citation {
  article_id: string;
  title: string;
  url: string;
  source: string;
  score: number;
}

/** Chat request payload (POST /api/chat). */
export interface ChatRequest {
  session_id: string;
  message: string;
  /** Narrow RAG retrieval to the user's current view. */
  context?: {
    category?: Category;
    region?: string;
    subcategory?: string;
    tags?: string[];
    hoursAgo?: number;   // ← match the news display window
  };
  history?: { role: "user" | "assistant"; content: string }[];
}
