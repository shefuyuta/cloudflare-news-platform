// workers/fetcher/parser.ts
// ---------------------------------------------------------------------
// Lightweight RSS/Atom parser for Cloudflare Workers.
// Uses regex — not a full XML parser, but reliable for well-formed feeds.
// ---------------------------------------------------------------------

export interface ParsedItem {
  title: string;
  url: string;
  summary: string;
  publishedAt: string;   // ISO 8601
}

/** Parse an RSS 2.0 or Atom feed body into a list of items. */
export function parseFeed(xml: string): ParsedItem[] {
  // Detect Atom vs RSS
  if (xml.includes("<feed") && xml.includes("xmlns=\"http://www.w3.org/2005/Atom\"")) {
    return parseAtom(xml);
  }
  if (xml.includes("<rdf:RDF") || xml.includes("xmlns:rdf=")) {
    return parseRDF(xml);
  }
  return parseRSS(xml);
}

function parseRSS(xml: string): ParsedItem[] {
  const items: ParsedItem[] = [];
  const itemBlocks = xml.match(/<item[\s>][\s\S]*?<\/item>/gi) ?? [];

  for (const block of itemBlocks) {
    const title   = extractTag(block, "title");
    const link    = extractTag(block, "link") || extractAttr(block, "link", "href");
    const desc    = extractTag(block, "description") || extractTag(block, "content:encoded") || "";
    const pubDate = extractTag(block, "pubDate") || extractTag(block, "dc:date") || "";

    if (!title || !link) continue;

    items.push({
      title: stripHtml(decodeEntities(title)).trim(),
      url: link.trim(),
      summary: stripHtml(decodeEntities(desc)).slice(0, 500).trim(),
      publishedAt: normalizeDate(pubDate),
    });
  }
  return items;
}

function parseAtom(xml: string): ParsedItem[] {
  const items: ParsedItem[] = [];
  const entryBlocks = xml.match(/<entry[\s>][\s\S]*?<\/entry>/gi) ?? [];

  for (const block of entryBlocks) {
    const title   = extractTag(block, "title");
    const link    = extractAttr(block, "link", "href");
    const summary = extractTag(block, "summary") || extractTag(block, "content") || "";
    const updated = extractTag(block, "updated") || extractTag(block, "published") || "";

    if (!title || !link) continue;

    items.push({
      title: stripHtml(decodeEntities(title)).trim(),
      url: link.trim(),
      summary: stripHtml(decodeEntities(summary)).slice(0, 500).trim(),
      publishedAt: normalizeDate(updated),
    });
  }
  return items;
}

function parseRDF(xml: string): ParsedItem[] {
  const items: ParsedItem[] = [];
  const itemBlocks = xml.match(/<item[\s>][\s\S]*?<\/item>/gi) ?? [];

  for (const block of itemBlocks) {
    const title   = extractTag(block, "title");
    const link    = extractTag(block, "link") || extractAttr(block, "item", "rdf:about");
    const desc    = extractTag(block, "description") || extractTag(block, "dc:description") || "";
    const date    = extractTag(block, "dc:date") || extractTag(block, "pubDate") || "";

    if (!title || !link) continue;

    items.push({
      title: stripHtml(decodeEntities(title)).trim(),
      url: link.trim(),
      summary: stripHtml(decodeEntities(desc)).slice(0, 500).trim(),
      publishedAt: normalizeDate(date),
    });
  }
  return items;
}

// --- Helpers ---

function extractTag(xml: string, tag: string): string | null {
  // Handle CDATA
  const cdataRe = new RegExp(`<${tag}[^>]*>\\s*<!\\[CDATA\\[([\\s\\S]*?)\\]\\]>\\s*</${tag}>`, "i");
  const cdataMatch = xml.match(cdataRe);
  if (cdataMatch) return cdataMatch[1];

  const re = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, "i");
  const match = xml.match(re);
  return match ? match[1] : null;
}

function extractAttr(xml: string, tag: string, attr: string): string | null {
  const re = new RegExp(`<${tag}[^>]*\\s${attr}=["']([^"']+)["']`, "i");
  const match = xml.match(re);
  return match ? match[1] : null;
}

function stripHtml(s: string): string {
  return s.replace(/<[^>]+>/g, "").replace(/\s+/g, " ");
}

function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(parseInt(n)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, n) => String.fromCharCode(parseInt(n, 16)));
}

function normalizeDate(s: string): string {
  if (!s) return new Date().toISOString();
  try {
    const d = new Date(s.trim());
    return isNaN(d.getTime()) ? new Date().toISOString() : d.toISOString();
  } catch {
    return new Date().toISOString();
  }
}
