// workers/fetcher/classifier.ts
// ---------------------------------------------------------------------
// Classify region (for general news) and subcategory (for cyber news)
// based on feed source hints + title/summary keyword analysis.
// ---------------------------------------------------------------------

import type { FeedSource } from "./feeds";

/** Determine region for general news articles. */
export function classifyRegion(
  source: FeedSource,
  title: string,
  summary: string,
): string {
  // 1. Use source hint if available
  if (source.regionHint) return source.regionHint;

  const text = (title + " " + summary).toLowerCase();

  // 2. Keyword-based detection
  if (/japan|tokyo|岸田|石破|日本|東京|自民党|nikkei/.test(text)) return "japan";
  if (/\bu\.?s\.?\b|america|washington|biden|trump|pentagon|congress|白House/.test(text)) return "us";
  if (/china|beijing|india|korea|seoul|台湾|taiwan|asean|singapore|vietnam|indonesia|asia/.test(text)) return "asia";
  if (/europe|eu\b|london|paris|berlin|brussels|ukraine|nato|kremlin|russia/.test(text)) return "europe";

  // 3. Detect by feed URL patterns
  const urls = source.urls.join(" ").toLowerCase();
  if (/guardian.*us-news|cnn/.test(urls)) return "us";
  if (/guardian.*europe|bbc/.test(urls)) return "europe";
  if (/guardian.*asia|nikkei/.test(urls)) return "asia";

  return "other";
}

/** Determine subcategory for cybersecurity articles. */
export function classifySubcategory(
  source: FeedSource,
  title: string,
  summary: string,
): string {
  // 1. Use source hint if available
  if (source.subHint) return source.subHint;

  const text = (title + " " + summary).toLowerCase();

  // 2. Vulnerability keywords
  if (/cve-\d{4}|vulnerabilit|脆弱性|patch|exploit|zero.?day|rce\b|xss\b|sql.?inject|buffer.?overflow|jvn/.test(text)) {
    return "vulnerability";
  }

  // 3. Incident keywords
  if (/breach|leak|ransomware|attack|incident|hack|compromis|data.?leak|不正アクセス|情報漏洩|ランサム|サイバー攻撃|インシデント/.test(text)) {
    return "incident";
  }

  return "other";
}

/** Generate relevant tags from title and summary. */
export function extractTags(
  category: string,
  title: string,
  summary: string,
): string[] {
  const text = (title + " " + summary);
  const tags = new Set<string>();

  // CVE IDs
  const cves = text.match(/CVE-\d{4}-\d{4,}/gi) ?? [];
  cves.forEach(c => tags.add(c.toUpperCase()));

  // Known product/vendor names
  const keywords: [RegExp, string][] = [
    [/microsoft|windows|azure/i, "Microsoft"],
    [/google|chrome|android/i, "Google"],
    [/apple|iphone|macos|ios\b/i, "Apple"],
    [/amazon|aws\b/i, "AWS"],
    [/openai|chatgpt|gpt-/i, "OpenAI"],
    [/anthropic|claude/i, "Anthropic"],
    [/meta\b|facebook|llama/i, "Meta"],
    [/ransomware|ランサム/i, "Ransomware"],
    [/phishing|フィッシング/i, "Phishing"],
    [/zero.?day/i, "Zero-Day"],
    [/supply.?chain/i, "Supply-Chain"],
    [/critical|緊急|重大/i, "Critical"],
    [/ai\b|artificial.?intelligence|人工知能|機械学習/i, "AI"],
    [/llm|large.?language/i, "LLM"],
    [/genai|generative.?ai|生成AI/i, "GenAI"],
    [/regulation|規制|法案/i, "Regulation"],
    [/cisco/i, "Cisco"],
    [/fortinet|fortigate/i, "Fortinet"],
    [/palo.?alto/i, "PaloAlto"],
    [/crowdstrike/i, "CrowdStrike"],
  ];

  for (const [re, tag] of keywords) {
    if (re.test(text)) tags.add(tag);
  }

  return [...tags].slice(0, 8);
}
