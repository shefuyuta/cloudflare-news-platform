// lib/rag/stats.ts
// ---------------------------------------------------------------------
// Fetch metadata statistics from D1 for the chatbot.
// These stats are injected into the system prompt so the LLM can
// answer questions like "how many cyber articles today?" or
// "which source has the most articles?"
// ---------------------------------------------------------------------

import type { Env } from "../types";

export interface NewsStats {
  totalArticles: number;
  byCategory: { category: string; count: number }[];
  bySource: { source: string; count: number }[];
  byRegion: { region: string; count: number }[];
  bySubcategory: { subcategory: string; count: number }[];
  recentTitles: { title: string; source: string; category: string; publishedAt: string }[];
  titleLengthAvg: number;
  oldestDate: string;
  newestDate: string;
}

export async function fetchNewsStats(env: Env): Promise<string> {
  try {
    const [
      totalRow,
      byCategoryRows,
      bySourceRows,
      byRegionRows,
      bySubcategoryRows,
      recentRows,
      titleStatsRow,
      dateRangeRow,
    ] = await Promise.all([
      env.DB.prepare("SELECT COUNT(*) as cnt FROM articles").first(),
      env.DB.prepare("SELECT category, COUNT(*) as cnt FROM articles GROUP BY category ORDER BY cnt DESC").all(),
      env.DB.prepare("SELECT source, COUNT(*) as cnt FROM articles GROUP BY source ORDER BY cnt DESC LIMIT 15").all(),
      env.DB.prepare("SELECT region, COUNT(*) as cnt FROM articles WHERE region IS NOT NULL GROUP BY region ORDER BY cnt DESC").all(),
      env.DB.prepare("SELECT subcategory, COUNT(*) as cnt FROM articles WHERE subcategory IS NOT NULL GROUP BY subcategory ORDER BY cnt DESC").all(),
      env.DB.prepare("SELECT title, source, category, published_at FROM articles ORDER BY published_at DESC LIMIT 10").all(),
      env.DB.prepare("SELECT AVG(LENGTH(title)) as avg_len, MIN(LENGTH(title)) as min_len, MAX(LENGTH(title)) as max_len FROM articles").first(),
      env.DB.prepare("SELECT MIN(published_at) as oldest, MAX(published_at) as newest FROM articles").first(),
    ]);

    const total = (totalRow as { cnt: number } | null)?.cnt ?? 0;

    const byCategory = (byCategoryRows.results ?? []).map(r => {
      const row = r as { category: string; cnt: number };
      return `${row.category}: ${row.cnt}`;
    }).join(", ");

    const bySource = (bySourceRows.results ?? []).map(r => {
      const row = r as { source: string; cnt: number };
      return `${row.source}: ${row.cnt}`;
    }).join(", ");

    const byRegion = (byRegionRows.results ?? []).map(r => {
      const row = r as { region: string; cnt: number };
      return `${row.region || "unset"}: ${row.cnt}`;
    }).join(", ");

    const bySubcategory = (bySubcategoryRows.results ?? []).map(r => {
      const row = r as { subcategory: string; cnt: number };
      return `${row.subcategory || "unset"}: ${row.cnt}`;
    }).join(", ");

    const recentTitles = (recentRows.results ?? []).map((r, i) => {
      const row = r as { title: string; source: string; category: string; published_at: string };
      return `  ${i + 1}. [${row.category}] "${row.title}" (${row.source}, ${row.published_at})`;
    }).join("\n");

    const ts = titleStatsRow as { avg_len: number; min_len: number; max_len: number } | null;
    const dr = dateRangeRow as { oldest: string; newest: string } | null;

    return [
      `Total articles in database: ${total}`,
      `By category: ${byCategory}`,
      `By source (top 15): ${bySource}`,
      `By region: ${byRegion}`,
      `By subcategory (cyber): ${bySubcategory}`,
      `Title length: avg=${Math.round(ts?.avg_len ?? 0)} chars, min=${ts?.min_len ?? 0}, max=${ts?.max_len ?? 0}`,
      `Date range: ${dr?.oldest ?? "?"} to ${dr?.newest ?? "?"}`,
      `Most recent 10 articles:`,
      recentTitles,
    ].join("\n");
  } catch (e) {
    console.warn("[stats] Failed to fetch:", e);
    return "(metadata stats unavailable)";
  }
}
