// lib/fetcher/classifier.ts
// ---------------------------------------------------------------------
// Content-based classification for category, region, and subcategory.
// Feed source category is used as a HINT only — article content decides.
// ---------------------------------------------------------------------

import type { FeedSource } from "./feeds";

/**
 * Determine the article's category based on CONTENT, not feed source.
 * Feed source category is used as a tiebreaker when content is ambiguous.
 */
export function classifyCategory(
  source: FeedSource,
  title: string,
  summary: string,
): "general" | "cybersecurity" | "ai" {
  const text = (title + " " + (summary || "")).toLowerCase();

  // --- Score each category based on keyword matches ---
  const cyberScore = scoreKeywords(text, [
    /cve-\d{4}/,
    /vulnerabilit/,
    /脆弱性/,
    /zero.?day/,
    /ransomware/,
    /ランサム/,
    /malware/,
    /マルウェア/,
    /phishing/,
    /フィッシング/,
    /breach/,
    /data.?leak/,
    /情報漏洩/,
    /不正アクセス/,
    /cyber.?attack/,
    /サイバー攻撃/,
    /cyber.?security/,
    /サイバーセキュリティ/,
    /exploit/,
    /botnet/,
    /ddos/,
    /firewall/,
    /intrusion/,
    /trojan/,
    /spyware/,
    /infosec/,
    /threat.?actor/,
    /apt\d/,
    /セキュリティ/,
    /security.?flaw/,
    /security.?patch/,
    /security.?update/,
    /security.?advisory/,
    /security.?bulletin/,
    /jpcert/,
    /jvn/,
  ]);

  const aiScore = scoreKeywords(text, [
    /\bartificial.?intelligence\b/,
    /\bai\b(?!r\b|ds?\b|med\b|port)/,  // "ai" but not "air", "aids", "aimed", "airport"
    /人工知能/,
    /machine.?learning/,
    /機械学習/,
    /deep.?learning/,
    /深層学習/,
    /\bllm\b/,
    /large.?language.?model/,
    /大規模言語/,
    /\bgpt[-\s]?\d/,
    /chatgpt/,
    /openai/,
    /anthropic/,
    /\bclaude\b/,
    /gemini/,
    /\bllama\b/,
    /生成ai/,
    /generative.?ai/,
    /\bgenai\b/,
    /neural.?network/,
    /ニューラル/,
    /transformer/,
    /diffusion.?model/,
    /foundation.?model/,
    /\bnlp\b/,
    /自然言語処理/,
    /computer.?vision/,
    /コンピュータビジョン/,
    /ai.?model/,
    /ai.?agent/,
    /ai.?safety/,
    /ai.?regulation/,
    /ai.?governance/,
    /ai.?ethics/,
    /copilot/,
    /hugging.?face/,
    /training.?data/,
    /fine.?tun/,
    /inference/,
    /embedding/,
    /prompt.?engineer/,
    /rag\b/,
    /retrieval.?augmented/,
  ]);

  // --- Decision logic ---
  // Strong signal: 2+ keyword matches → override feed source
  if (cyberScore >= 2) return "cybersecurity";
  if (aiScore >= 2) return "ai";

  // Medium signal: 1 keyword match → use it if feed source agrees or is general
  if (cyberScore === 1 && (source.category === "cybersecurity" || source.category === "general")) return "cybersecurity";
  if (aiScore === 1 && (source.category === "ai" || source.category === "general")) return "ai";

  // Weak/no signal: use feed source as default, but validate
  // If feed says "ai" or "cybersecurity" but content has zero matches → downgrade to "general"
  if (source.category === "ai" && aiScore === 0) return "general";
  if (source.category === "cybersecurity" && cyberScore === 0) return "general";

  return source.category;
}

/** Count how many patterns match in the text. */
function scoreKeywords(text: string, patterns: RegExp[]): number {
  let score = 0;
  for (const p of patterns) {
    if (p.test(text)) score++;
  }
  return score;
}

/** Determine region for general news articles. */
export function classifyRegion(
  source: FeedSource,
  title: string,
  summary: string,
): string {
  const text = (title + " " + (summary || "")).toLowerCase();

  // Keyword-based detection first (more accurate than source hint)
  if (/japan|tokyo|岸田|石破|日本|東京|自民党|nikkei|大阪|osaka/.test(text)) return "japan";
  if (/\bu\.?s\.?\b|america|washington|biden|trump|pentagon|congress|new.?york|california/.test(text)) return "us";
  if (/china|beijing|india|korea|seoul|台湾|taiwan|asean|singapore|vietnam|indonesia|asia|philippines|manila|bangkok/.test(text)) return "asia";
  if (/europe|eu\b|london|paris|berlin|brussels|ukraine|nato|kremlin|russia|germany|france|uk\b|britain/.test(text)) return "europe";

  // Fall back to source hint
  if (source.regionHint) return source.regionHint;

  return "other";
}

/** Determine subcategory for cybersecurity articles. */
export function classifySubcategory(
  source: FeedSource,
  title: string,
  summary: string,
): string {
  const text = (title + " " + (summary || "")).toLowerCase();

  // Vulnerability keywords
  if (/cve-\d{4}|vulnerabilit|脆弱性|patch|exploit|zero.?day|rce\b|xss\b|sql.?inject|buffer.?overflow|jvn|security.?update|security.?patch|security.?advisory/.test(text)) {
    return "vulnerability";
  }

  // Incident keywords
  if (/breach|leak|ransomware|attack|incident|hack|compromis|data.?leak|不正アクセス|情報漏洩|ランサム|サイバー攻撃|インシデント|arrested|takedown|disrupted/.test(text)) {
    return "incident";
  }

  // Fall back to source hint
  if (source.subHint) return source.subHint;

  return "other";
}

/** Generate relevant tags from title and summary. */
export function extractTags(
  category: string,
  title: string,
  summary: string,
): string[] {
  const text = (title + " " + (summary || ""));
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
    [/nvidia/i, "NVIDIA"],
    [/ransomware|ランサム/i, "Ransomware"],
    [/phishing|フィッシング/i, "Phishing"],
    [/zero.?day/i, "Zero-Day"],
    [/supply.?chain/i, "Supply-Chain"],
    [/critical|緊急|重大/i, "Critical"],
    [/\bai\b|artificial.?intelligence|人工知能/i, "AI"],
    [/\bllm\b|large.?language/i, "LLM"],
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
