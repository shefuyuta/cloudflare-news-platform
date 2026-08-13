// lib/rag/ransomware-tool.ts
//
// The RAG chat's normal path is semantic search over `articles` (news text).
// That's the wrong tool for questions like "how many Qilin victims this
// week?" — semantic search returns relevant PROSE, not an accurate COUNT,
// and an LLM asked to "read and count" retrieved snippets will guess. This
// module detects when a question is asking for ransomware activity/stats
// and answers it with a real SQL aggregate against `ransomware_victims`
// instead, so the chat reports an exact number rather than an inference.
//
// This is intentionally NOT the same shape as the old keyword-stats
// side-channel that was removed (see apply-rag-remove-stats.ps1): that fed
// the model an exact-string-match count for the user's literal question
// ALONGSIDE unrelated semantic sources, with instructions to trust the
// count over its own reading — which produced "0 articles found" even when
// the sources held 6 relevant articles. This tool only fires when the
// question is clearly ransomware-shaped, returns ONE unambiguous aggregate
// (not a competing signal next to article sources), and is rendered as its
// own labeled block so the model can't confuse it with article content.
import type { Env } from "../types";

const RANSOM_KEYWORDS = [
  "ransom", "ランサム", "身代金", "victim", "被害",
];

/** Cheap pre-check: does the question even look ransomware-related?
 *  Avoids running the (cheap but not free) group-name lookup below on every
 *  chat turn. */
export function looksRansomwareRelated(message: string): boolean {
  const m = message.toLowerCase();
  return RANSOM_KEYWORDS.some(k => m.includes(k.toLowerCase()));
}

export interface RansomwareStatsResult {
  /** Human-readable block to inject into the prompt as its own section. */
  block: string;
  /** True if we found nothing worth reporting (caller can skip the block). */
  empty: boolean;
}

/**
 * Build an accurate ransomware activity summary for the chat prompt.
 * - If the message names a specific group (matched against distinct
 *   group_name values in the DB), scope everything to that group.
 * - Otherwise, give an overall 7-day pulse: total, top groups, surging groups.
 * Numbers come straight from SQL — nothing here is inferred by the LLM.
 */
export async function buildRansomwareStats(env: Env, message: string): Promise<RansomwareStatsResult> {
  const groups = await env.DB.prepare(
    `SELECT DISTINCT group_name FROM ransomware_victims WHERE group_name IS NOT NULL AND group_name != ''`
  ).all();
  const groupNames = (groups.results ?? []).map(r => (r as { group_name: string }).group_name).filter(Boolean);

  const lowerMsg = message.toLowerCase();
  // Longest-match-first so e.g. "lockbit5" isn't shadowed by a shorter
  // unrelated substring match.
  const matchedGroup = groupNames
    .filter(g => g.length >= 3 && lowerMsg.includes(g.toLowerCase()))
    .sort((a, b) => b.length - a.length)[0];

  if (matchedGroup) {
    const [totalRow, last7Row, last30Row, countryRows] = await Promise.all([
      env.DB.prepare(`SELECT COUNT(*) AS c FROM ransomware_victims WHERE group_name = ?`).bind(matchedGroup).first() as Promise<{ c: number } | null>,
      env.DB.prepare(`SELECT COUNT(*) AS c FROM ransomware_victims WHERE group_name = ? AND discovered != '' AND julianday('now') - julianday(discovered) < 7`).bind(matchedGroup).first() as Promise<{ c: number } | null>,
      env.DB.prepare(`SELECT COUNT(*) AS c FROM ransomware_victims WHERE group_name = ? AND discovered != '' AND julianday('now') - julianday(discovered) < 30`).bind(matchedGroup).first() as Promise<{ c: number } | null>,
      env.DB.prepare(`SELECT country, COUNT(*) AS c FROM ransomware_victims WHERE group_name = ? AND country IS NOT NULL AND country != '' GROUP BY country ORDER BY c DESC LIMIT 5`).bind(matchedGroup).all(),
    ]);
    const total  = totalRow?.c ?? 0;
    if (total === 0) return { block: "", empty: true };
    const countries = (countryRows.results ?? [])
      .map(r => `${(r as { country: string }).country} (${(r as { c: number }).c})`)
      .join(", ");
    const block =
      `Group: ${matchedGroup}\n` +
      `Total victims on record: ${total}\n` +
      `New victims — last 7 days: ${last7Row?.c ?? 0}, last 30 days: ${last30Row?.c ?? 0}\n` +
      (countries ? `Top countries: ${countries}\n` : "");
    return { block, empty: false };
  }

  // No specific group named — overall pulse.
  const [last7Row, topGroupRows, surgeRows] = await Promise.all([
    env.DB.prepare(`SELECT COUNT(*) AS c FROM ransomware_victims WHERE discovered != '' AND julianday('now') - julianday(discovered) < 7`).first() as Promise<{ c: number } | null>,
    env.DB.prepare(`SELECT group_name AS g, COUNT(*) AS c FROM ransomware_victims WHERE discovered != '' AND julianday('now') - julianday(discovered) < 7 GROUP BY g ORDER BY c DESC LIMIT 5`).all(),
    env.DB.prepare(`
      SELECT group_name AS g,
             CASE WHEN julianday('now') - julianday(discovered) < 7 THEN 'recent' ELSE 'prior' END AS bucket,
             COUNT(*) AS c
      FROM ransomware_victims
      WHERE discovered != '' AND julianday('now') - julianday(discovered) < 14
      GROUP BY g, bucket
    `).all(),
  ]);

  const last7 = last7Row?.c ?? 0;
  if (last7 === 0) return { block: "", empty: true };

  const topGroups = (topGroupRows.results ?? [])
    .map(r => `${(r as { g: string }).g} (${(r as { c: number }).c})`)
    .join(", ");

  // Same recent-vs-prior 7-day surge logic used on the ransomware page/dashboard.
  const byGroup = new Map<string, { recent: number; prior: number }>();
  for (const row of (surgeRows.results ?? []) as { g: string; bucket: string; c: number }[]) {
    const g = row.g || "Unknown";
    const entry = byGroup.get(g) ?? { recent: 0, prior: 0 };
    if (row.bucket === "recent") entry.recent += Number(row.c); else entry.prior += Number(row.c);
    byGroup.set(g, entry);
  }
  const surging = [...byGroup.entries()]
    .filter(([, v]) => v.recent >= 3 && v.recent > v.prior)
    .map(([g, v]) => v.prior > 0 ? `${g} (+${Math.round(((v.recent - v.prior) / v.prior) * 100)}%)` : `${g} (new)`)
    .slice(0, 3)
    .join(", ");

  const block =
    `New ransomware victims — last 7 days: ${last7}\n` +
    (topGroups ? `Top groups (last 7 days): ${topGroups}\n` : "") +
    (surging ? `Surging groups: ${surging}\n` : "");

  return { block, empty: false };
}
