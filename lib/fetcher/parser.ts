// lib/fetcher/parser.ts
// ---------------------------------------------------------------------
// Lightweight RSS/Atom/RDF parser for Cloudflare Workers.
// Improved description extraction for various feed formats.
// ---------------------------------------------------------------------

export interface ParsedItem {
  title: string;
  url: string;
  summary: string;
  publishedAt: string;   // ISO 8601
}

/** Parse an RSS 2.0, Atom, or RDF feed body into a list of items. */
export function parseFeed(xml: string): ParsedItem[] {
  // Detect Atom vs RSS vs RDF
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
    const title = extractTag(block, "title");
    const link  = extractTagContent(block, "link") || extractAttr(block, "link", "href");
    const desc  = extractDescription(block);
    const date  = extractTag(block, "pubDate")
               || extractTag(block, "dc:date")
               || extractTag(block, "date")
               || "";

    if (!title || !link) continue;

    items.push({
      title: clean(title),
      url: link.trim(),
      summary: clean(desc).slice(0, 600),
      publishedAt: normalizeDate(date),
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
    const summary = extractTag(block, "summary")
                 || extractTag(block, "content")
                 || extractTag(block, "content:encoded")
                 || "";
    const date    = extractTag(block, "updated")
                 || extractTag(block, "published")
                 || extractTag(block, "issued")
                 || "";

    if (!title || !link) continue;

    items.push({
      title: clean(title),
      url: link.trim(),
      summary: clean(summary).slice(0, 600),
      publishedAt: normalizeDate(date),
    });
  }
  return items;
}

function parseRDF(xml: string): ParsedItem[] {
  const items: ParsedItem[] = [];
  const itemBlocks = xml.match(/<item[\s>][\s\S]*?<\/item>/gi) ?? [];

  for (const block of itemBlocks) {
    const title = extractTag(block, "title");
    const link  = extractTagContent(block, "link")
               || extractAttr(block, "item", "rdf:about")
               || extractAttr(block, "item", "about");
    const desc  = extractDescription(block);
    const date  = extractTag(block, "dc:date")
               || extractTag(block, "pubDate")
               || extractTag(block, "date")
               || "";

    if (!title || !link) continue;

    items.push({
      title: clean(title),
      url: link.trim(),
      summary: clean(desc).slice(0, 600),
      publishedAt: normalizeDate(date),
    });
  }
  return items;
}

// --- Description extraction (tries multiple tag names) ---

function extractDescription(block: string): string {
  // Try in priority order: content:encoded > description > dc:description > summary
  return extractTag(block, "content:encoded")
      || extractTag(block, "description")
      || extractTag(block, "dc:description")
      || extractTag(block, "summary")
      || extractTag(block, "media:description")
      || "";
}

// --- Tag extraction helpers ---

/** Extract inner text/CDATA of an XML tag. Handles CDATA, nested tags, etc. */
function extractTag(xml: string, tag: string): string | null {
  // 1. Try CDATA first
  const cdataRe = new RegExp(`<${tag}[^>]*>\\s*<!\\[CDATA\\[([\\s\\S]*?)\\]\\]>\\s*</${tag}>`, "i");
  const cdataMatch = xml.match(cdataRe);
  if (cdataMatch) return cdataMatch[1];

  // 2. Normal tag content
  const re = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, "i");
  const match = xml.match(re);
  return match ? match[1] : null;
}

/** Extract the text content of a simple tag (for <link> which sometimes has no closing tag). */
function extractTagContent(xml: string, tag: string): string | null {
  // First try normal extraction
  const normal = extractTag(xml, tag);
  if (normal && normal.trim()) return normal.trim();

  // Handle self-closing or text-only <link>http://...</link>
  const re = new RegExp(`<${tag}[^>]*>([^<]+)`, "i");
  const match = xml.match(re);
  return match ? match[1].trim() : null;
}

function extractAttr(xml: string, tag: string, attr: string): string | null {
  // Match: <tag ... attr="value" or <tag ... attr='value'
  const re = new RegExp(`<${tag}[^>]*\\s${attr}=["']([^"']+)["']`, "i");
  const match = xml.match(re);
  return match ? match[1] : null;
}

// --- Cleaning helpers ---

function clean(s: string | null): string {
  if (!s) return "";
  return stripHtml(decodeEntities(stripStyleAndCss(s)))
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Remove <style>/<script> blocks (including their CONTENTS) and bare CSS
 * rule blocks before tag-stripping. Plain stripHtml only removes the
 * <style> tags, leaving the CSS text behind — which is how feeds like
 * RedPacketSecurity leak "#rps-openai-block{ display:flex; … }" into the
 * summary. Doing this at the parser means every downstream consumer
 * (storage, display, classification, embedding) gets clean text.
 */
function stripStyleAndCss(s: string): string {
  let out = s;
  // Whole <style>/<script> blocks, contents included.
  out = out.replace(/<style[\s\S]*?<\/style>/gi, " ");
  out = out.replace(/<script[\s\S]*?<\/script>/gi, " ");
  // HTML comments and CSS block comments.
  out = out.replace(/<!--[\s\S]*?-->/g, " ");
  out = out.replace(/\/\*[\s\S]*?\*\//g, " ");
  // Bare CSS rule blocks: "selector { prop: value; … }". A few passes
  // handle stacked rules; conservative so real prose isn't harmed.
  for (let i = 0; i < 5 && /\{[^{}]*\}/.test(out); i++) {
    out = out.replace(/[^{}]*\{[^{}]*\}/g, " ");
  }
  return out;
}

function stripHtml(s: string): string {
  return s.replace(/<[^>]+>/g, "");
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
