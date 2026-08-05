// lib/fetcher/classifier.ts
// ---------------------------------------------------------------------
// Content-based classification for category, region, and subcategory.
// Feed source category is used as a HINT only — article content decides.
//
// Multi-label model (see design discussion):
//   - Every article has ONE primary `category` (for the row + main badge).
//   - It may ALSO carry cross-cut labels ("AI"/"Cyber") so it appears on
//     more than one desk. These are surfaced as tags, not extra columns.
//   - Subcategory is likewise multi-label: an article can be BOTH a
//     vulnerability and an incident (e.g. "exploited CVE used to deploy
//     ransomware"). We no longer use first-match-wins.
// ---------------------------------------------------------------------

import type { FeedSource } from "./feeds";

const CYBER_PATTERNS: RegExp[] = [
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
];

const AI_PATTERNS: RegExp[] = [
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
];

/** Threshold at which a category's keyword score counts as a "strong" signal. */
const STRONG = 2;

/**
 * Full classification result.
 *
 * `category` is the single primary desk the row is stored under.
 * `crossLabels` are additional desks the article ALSO belongs to
 * (values: "AI" | "Cyber"), surfaced as tags so /ai and /cybersecurity
 * can both show it. Empty when the article is single-topic.
 */
export interface CategoryResult {
  category: "general" | "cybersecurity" | "ai";
  crossLabels: string[];   // subset of ["AI", "Cyber"], excluding the primary
}

/**
 * Determine the article's primary category AND any cross-cut labels,
 * based on CONTENT. Feed source category is a tiebreaker only.
 *
 * Primary selection keeps the previous behaviour (cyber wins ties) so
 * existing rows stay stable, but cross-labels ensure an AI-security
 * story still reaches the AI desk instead of vanishing.
 */
export function classifyCategoryMulti(
  source: FeedSource,
  title: string,
  summary: string,
): CategoryResult {
  const text = (title + " " + (summary || "")).toLowerCase();

  const cyberScore = scoreKeywords(text, CYBER_PATTERNS);
  const aiScore    = scoreKeywords(text, AI_PATTERNS);

  const cyberStrong = cyberScore >= STRONG;
  const aiStrong    = aiScore >= STRONG;

  // --- Primary category (single) ---------------------------------
  let primary: CategoryResult["category"];
  if (cyberStrong || aiStrong) {
    // Both strong → pick the higher score; tie → cyber (stable default).
    if (cyberStrong && aiStrong) {
      primary = aiScore > cyberScore ? "ai" : "cybersecurity";
    } else {
      primary = cyberStrong ? "cybersecurity" : "ai";
    }
  } else if (cyberScore === 1 && (source.category === "cybersecurity" || source.category === "general")) {
    primary = "cybersecurity";
  } else if (aiScore === 1 && (source.category === "ai" || source.category === "general")) {
    primary = "ai";
  } else if (source.category === "ai" && aiScore === 0) {
    primary = "general";
  } else if (source.category === "cybersecurity" && cyberScore === 0) {
    primary = "general";
  } else {
    primary = source.category;
  }

  // --- Cross-cut labels (multi) ----------------------------------
  // An article is cross-labelled for a desk when it has a STRONG signal
  // for that desk but it isn't the primary. This is deliberately
  // conservative (STRONG only) to avoid flooding a desk with weak hits.
  const crossLabels: string[] = [];
  if (aiStrong    && primary !== "ai")            crossLabels.push("AI");
  if (cyberStrong && primary !== "cybersecurity") crossLabels.push("Cyber");

  return { category: primary, crossLabels };
}

/**
 * Backwards-compatible single-category helper. Retained so any caller
 * that only needs the primary desk keeps working.
 */
export function classifyCategory(
  source: FeedSource,
  title: string,
  summary: string,
): "general" | "cybersecurity" | "ai" {
  return classifyCategoryMulti(source, title, summary).category;
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

// ---------------------------------------------------------------------
// Subcategory: multi-label, score-based (NOT first-match-wins).
// ---------------------------------------------------------------------

const VULN_PATTERNS: RegExp[] = [
  /cve-\d{4}/,
  /vulnerabilit/,
  /脆弱性/,
  /\bpatch(ed|es|ing)?\b/,
  /zero.?day/,
  /\brce\b/,
  /\bxss\b/,
  /sql.?inject/,
  /buffer.?overflow/,
  /\bjvn\b/,
  /security.?update/,
  /security.?patch/,
  /security.?advisory/,
  /proof.?of.?concept/,
  /\bpoc\b/,
  /flaw/,
];

const INCIDENT_PATTERNS: RegExp[] = [
  /breach/,
  /\bleak(ed|s)?\b/,
  /ransomware/,
  /\bhack(ed|er|ers|ing)?\b/,
  /\bincident\b/,
  /compromis/,
  /data.?leak/,
  /不正アクセス/,
  /情報漏洩/,
  /ランサム/,
  /サイバー攻撃/,
  /インシデント/,
  /arrested/,
  /takedown/,
  /disrupted/,
  /\bvictim\b/,           // "ransomware victim", "added to leak site"
  /leak.?site/,
  /extortion/,
  /exfiltrat/,
  /claimed.?by/,
  /被害/,
];

/**
 * Subcategory labels for a cybersecurity article.
 *
 * Returns EVERY subcategory that scores above zero (multi-label). A
 * story that is both a vulnerability and an incident (very common —
 * "attackers exploited CVE-… to deploy ransomware") returns both. When
 * nothing matches, falls back to the source hint, then "other".
 *
 * NOTE (Phase 2 / embeddings): the ambiguous middle — where an article
 * sits between vuln and incident — is exactly what embedding similarity
 * will disambiguate. The hook is `classifySubcategoriesEmbedding` below;
 * this keyword version is the Phase-1 structural fix (kills first-match
 * bias) and remains the deterministic fallback.
 */
export function classifySubcategories(
  source: FeedSource,
  title: string,
  summary: string,
): string[] {
  const text = (title + " " + (summary || "")).toLowerCase();

  const vulnScore = scoreKeywords(text, VULN_PATTERNS);
  const incScore  = scoreKeywords(text, INCIDENT_PATTERNS);

  const labels: string[] = [];
  if (vulnScore > 0) labels.push("vulnerability");
  if (incScore  > 0) labels.push("incident");

  if (labels.length) return labels;

  if (source.subHint) return [source.subHint];
  return ["other"];
}

/**
 * Pick a single PRIMARY subcategory for the article row's `subcategory`
 * column (kept for backward compatibility and the row badge). Uses the
 * higher keyword score; ties resolve to "vulnerability" for stability.
 * The full multi-label set lives in tags (sub:vulnerability / sub:incident).
 */
export function classifySubcategory(
  source: FeedSource,
  title: string,
  summary: string,
): string {
  const text = (title + " " + (summary || "")).toLowerCase();
  const vulnScore = scoreKeywords(text, VULN_PATTERNS);
  const incScore  = scoreKeywords(text, INCIDENT_PATTERNS);

  if (vulnScore === 0 && incScore === 0) {
    return source.subHint ?? "other";
  }
  // Higher score wins; tie → incident is usually the more specific
  // real-world event, but we keep vulnerability as the stable default
  // ONLY when it strictly leads. Ties go to incident to correct the
  // historical over-classification into "vulnerability".
  if (incScore > vulnScore) return "incident";
  if (vulnScore > incScore) return "vulnerability";
  return "incident"; // tie-break corrected (was: first-match = vulnerability)
}

/**
 * Phase-2 embedding hook (not yet active). Given precomputed reference
 * vectors for each subcategory and the article's own embedding, return
 * the labels whose cosine similarity clears the threshold. Wired in a
 * later step once reference vectors are backfilled; until then callers
 * use `classifySubcategories`.
 */
export async function classifySubcategoriesEmbedding(
  _articleVector: number[],
  _refVectors: Record<string, number[]>,
  _threshold = 0.5,
): Promise<string[] | null> {
  // Intentionally unimplemented in Phase 1. Returning null signals the
  // caller to fall back to the keyword classifier above.
  return null;
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
