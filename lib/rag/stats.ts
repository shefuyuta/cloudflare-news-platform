// lib/rag/stats.ts
// ---------------------------------------------------------------------
// Fetch metadata statistics + dynamic keyword counts from D1.
// These stats are injected into the system prompt so the LLM can
// answer questions like "how many articles mention ransomware?" or
// "which source has the most articles?"
// ---------------------------------------------------------------------

import type { Env } from "../types";

/**
 * Fetch fixed stats + keyword-based counts derived from the user's question.
 * @param userMessage - The user's question (used to extract search keywords)
 */
export async function fetchNewsStats(env: Env, userMessage: string): Promise<string> {
  try {
    // --- Fixed stats (always included) ---
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

    const sections: string[] = [
      `Total articles in database: ${total}`,
      `By category: ${byCategory}`,
      `By source (top 15): ${bySource}`,
      `By region: ${byRegion}`,
      `By subcategory (cyber): ${bySubcategory}`,
      `Title length: avg=${Math.round(ts?.avg_len ?? 0)} chars, min=${ts?.min_len ?? 0}, max=${ts?.max_len ?? 0}`,
      `Date range: ${dr?.oldest ?? "?"} to ${dr?.newest ?? "?"}`,
      `Most recent 10 articles:`,
      recentTitles,
    ];

    // --- Dynamic keyword search (based on user's question) ---
    const keywords = extractSearchKeywords(userMessage);
    if (keywords.length > 0) {
      const keywordResults = await searchKeywords(env, keywords);
      sections.push("");
      sections.push("--- Dynamic keyword search results ---");
      sections.push(keywordResults);
    }

    return sections.join("\n");
  } catch (e) {
    console.warn("[stats] Failed to fetch:", e);
    return "(metadata stats unavailable)";
  }
}

/**
 * Extract likely search keywords from the user's question.
 * Looks for quoted strings, specific nouns, and technical terms.
 */
function extractSearchKeywords(message: string): string[] {
  const keywords: string[] = [];

  // 1. Quoted strings: "ransomware" or 「ランサムウェア」
  const quoted = message.match(/["「]([^"」]+)["」]/g);
  if (quoted) {
    quoted.forEach(q => keywords.push(q.replace(/["「」]/g, "")));
  }

  // 2. "〇〇を含む" / "〇〇に関する" / "〇〇について" patterns (Japanese)
  const jaPatterns = message.match(/(.{2,20}?)(?:を含む|に関する|について|に関して|のニュース|の記事|は何件|はいくつ|が含まれ)/g);
  if (jaPatterns) {
    jaPatterns.forEach(p => {
      const clean = p.replace(/(?:を含む|に関する|について|に関して|のニュース|の記事|は何件|はいくつ|が含まれ)$/, "").trim();
      if (clean.length >= 2) keywords.push(clean);
    });
  }

  // 3. "containing X" / "about X" / "related to X" / "mentions X" patterns (English)
  const enPatterns = message.match(/(?:contain(?:ing|s)?|about|related to|mention(?:ing|s)?|with|involving)\s+["']?(\w[\w\s-]{1,30})["']?/gi);
  if (enPatterns) {
    enPatterns.forEach(p => {
      const clean = p.replace(/^(?:contain(?:ing|s)?|about|related to|mention(?:ing|s)?|with|involving)\s+/i, "").replace(/["']/g, "").trim();
      if (clean.length >= 2) keywords.push(clean);
    });
  }

  // 4. Technical terms that are likely search targets
  const techTerms = message.match(/\b(?:CVE-\d{4}-\d+|ransomware|phishing|zero-?day|malware|DDoS|APT\d+|OpenAI|ChatGPT|Claude|Anthropic|Microsoft|Google|Apple|AWS|NVIDIA)\b/gi);
  if (techTerms) {
    techTerms.forEach(t => keywords.push(t));
  }

  // 5. If the question asks "how many" / "何件" but no keywords extracted yet,
  //    try to get the main noun from the question
  if (keywords.length === 0 && /何件|いくつ|how many|count/i.test(message)) {
    // Take the longest non-stopword segment
    const segments = message
      .replace(/[？?。、,!！\s]+/g, " ")
      .replace(/(?:は|が|の|を|に|で|と|も|や|から|まで|について|に関する|ニュース|記事|何件|いくつ|ありますか|ですか|教えて|how many|articles?|news|are there|contain)/gi, " ")
      .split(/\s+/)
      .filter(s => s.length >= 2)
      .sort((a, b) => b.length - a.length);
    if (segments.length > 0) {
      keywords.push(segments[0]);
    }
  }

  // Deduplicate (case-insensitive)
  const seen = new Set<string>();
  return keywords.filter(k => {
    const lower = k.toLowerCase();
    if (seen.has(lower)) return false;
    seen.add(lower);
    return true;
  }).slice(0, 5); // Max 5 keywords
}

/**
 * Run keyword searches against D1 and return formatted results.
 */
async function searchKeywords(env: Env, keywords: string[]): Promise<string> {
  const results: string[] = [];

  for (const keyword of keywords) {
    try {
      // Count in title
      const titleCount = await env.DB.prepare(
        "SELECT COUNT(*) as cnt FROM articles WHERE title LIKE ?"
      ).bind(`%${keyword}%`).first() as { cnt: number } | null;

      // Count in summary
      const summaryCount = await env.DB.prepare(
        "SELECT COUNT(*) as cnt FROM articles WHERE summary LIKE ?"
      ).bind(`%${keyword}%`).first() as { cnt: number } | null;

      // Count in title OR summary (deduplicated)
      const eitherCount = await env.DB.prepare(
        "SELECT COUNT(*) as cnt FROM articles WHERE title LIKE ? OR summary LIKE ?"
      ).bind(`%${keyword}%`, `%${keyword}%`).first() as { cnt: number } | null;

      // Breakdown by category
      const byCatRows = await env.DB.prepare(
        "SELECT category, COUNT(*) as cnt FROM articles WHERE title LIKE ? OR summary LIKE ? GROUP BY category ORDER BY cnt DESC"
      ).bind(`%${keyword}%`, `%${keyword}%`).all();

      const byCat = (byCatRows.results ?? []).map(r => {
        const row = r as { category: string; cnt: number };
        return `${row.category}:${row.cnt}`;
      }).join(", ");

      // Sample matching titles (up to 5)
      const sampleRows = await env.DB.prepare(
        "SELECT title, source, category, published_at FROM articles WHERE title LIKE ? OR summary LIKE ? ORDER BY published_at DESC LIMIT 5"
      ).bind(`%${keyword}%`, `%${keyword}%`).all();

      const samples = (sampleRows.results ?? []).map((r, i) => {
        const row = r as { title: string; source: string; category: string; published_at: string };
        return `    ${i + 1}. [${row.category}] "${row.title}" (${row.source}, ${row.published_at})`;
      }).join("\n");

      results.push([
        `Keyword "${keyword}":`,
        `  In title: ${titleCount?.cnt ?? 0} articles`,
        `  In summary: ${summaryCount?.cnt ?? 0} articles`,
        `  In title OR summary: ${eitherCount?.cnt ?? 0} articles`,
        `  By category: ${byCat || "none"}`,
        `  Sample matches:`,
        samples || "    (none)",
      ].join("\n"));
    } catch (e) {
      results.push(`Keyword "${keyword}": search failed (${e})`);
    }
  }

  return results.join("\n\n");
}
