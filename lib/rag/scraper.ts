// lib/rag/scraper.ts
// ---------------------------------------------------------------------
// Lightweight page scraper for Workers runtime.
// Fetches article URLs and extracts readable text content.
// Used by the chat endpoint to provide richer context to the LLM.
// ---------------------------------------------------------------------

const FETCH_HEADERS = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36",
  "Accept": "text/html,application/xhtml+xml,*/*",
  "Accept-Language": "ja,en-US;q=0.8,en;q=0.7",
};

const FETCH_TIMEOUT_MS = 5000;

/**
 * Fetch a URL and extract readable text.
 * Returns null on any failure (timeout, block, parse error).
 */
export async function scrapeArticle(url: string): Promise<string | null> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

    const resp = await fetch(url, {
      headers: FETCH_HEADERS,
      signal: controller.signal,
      redirect: "follow",
    });

    clearTimeout(timeout);

    if (!resp.ok) return null;

    const contentType = resp.headers.get("content-type") ?? "";
    if (!contentType.includes("text/html") && !contentType.includes("text/plain")) {
      return null;
    }

    const html = await resp.text();
    return extractText(html);
  } catch {
    return null; // timeout, network error, etc.
  }
}

/**
 * Fetch multiple URLs in parallel with a total time budget.
 * Returns a map of url → extracted text (only successful ones).
 */
export async function scrapeMultiple(
  urls: string[],
  maxConcurrent: number = 3,
): Promise<Map<string, string>> {
  const results = new Map<string, string>();

  // Process in batches to limit concurrency
  for (let i = 0; i < urls.length; i += maxConcurrent) {
    const batch = urls.slice(i, i + maxConcurrent);
    const settled = await Promise.allSettled(
      batch.map(async url => {
        const text = await scrapeArticle(url);
        if (text) results.set(url, text);
      })
    );
  }

  return results;
}

// --- HTML → Text extraction ---

function extractText(html: string): string {
  // 1. Remove script, style, nav, header, footer, aside
  let text = html
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<nav[\s\S]*?<\/nav>/gi, "")
    .replace(/<header[\s\S]*?<\/header>/gi, "")
    .replace(/<footer[\s\S]*?<\/footer>/gi, "")
    .replace(/<aside[\s\S]*?<\/aside>/gi, "")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, "");

  // 2. Try to extract <article> or main content area
  const articleMatch = text.match(/<article[\s\S]*?<\/article>/i);
  const mainMatch = text.match(/<main[\s\S]*?<\/main>/i);
  const contentMatch = text.match(/<div[^>]*(?:class|id)="[^"]*(?:article|content|entry|post|story|body)[^"]*"[\s\S]*?<\/div>/i);

  if (articleMatch) {
    text = articleMatch[0];
  } else if (mainMatch) {
    text = mainMatch[0];
  } else if (contentMatch) {
    text = contentMatch[0];
  }

  // 3. Convert <p>, <br>, <li> to newlines for readability
  text = text
    .replace(/<\/p>/gi, "\n\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/li>/gi, "\n")
    .replace(/<\/h[1-6]>/gi, "\n\n");

  // 4. Strip all remaining HTML tags
  text = text.replace(/<[^>]+>/g, "");

  // 5. Decode HTML entities
  text = text
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&nbsp;/g, " ");

  // 6. Clean up whitespace
  text = text
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  // 7. Truncate to reasonable length
  return text.slice(0, 3000);
}
