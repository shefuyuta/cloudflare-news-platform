// lib/ransomware.ts
// Types and fetch logic for ransomware.live API.
// Field names verified against actual API response (2025-05).

export interface RansomwareVictim {
  // ransomware.live API v2 shape. The v1 endpoint (post_title/group_name/
  // post_url/published) was retired — v1 URLs now 301-redirect to /v1/ and
  // the bare host serves an HTML "Redirecting…" page, so the old code's
  // res.json() threw and every cron ransomware fetch silently failed.
  // v2 renames most fields; see the mapping in lib/pipeline/ransomware-fetch.ts.
  victim:      string;    // was post_title — victim / organization name
  group:       string;    // was group_name — threat actor group
  country:     string;    // ISO 3166-1 alpha-2 e.g. "JP"
  activity:    string;    // industry / sector
  domain:      string;    // was website
  description: string;
  discovered:  string;    // ISO datetime (unchanged)
  attackdate:  string;    // was published — ISO datetime
  claim_url:   string;    // was post_url — onion leak-site URL (may be "")
  url:         string;    // NEW — public ransomware.live page, always unique
  screenshot?: string;
}

export interface VictimWithNews {
  uid:          string;   // UUID extracted from post_url
  victim:       string;   // = post_title (English)
  victimJa:     string;   // Japanese name (AI-translated, may equal victim if unknown)
  group:        string;   // = group_name
  groupDisplay: string;
  activity:     string;
  website:      string;
  description:  string;
  post_url:     string;   // onion leak-site URL (not directly clickable)
  publicUrl:    string;   // public ransomware.live page (https, clickable)
  discovered:   string;
  discoveredFmt: string;
  country:      string;   // raw country from ransomware.live ("" if unknown)
  relatedNews: {
    id: string;
    title: string;
    url: string;
    source: string;
    publishedAt: string;
  }[];
}

// v2 lives under /v2. We hit it directly rather than the bare host, whose
// only purpose now is to 301-redirect to a versioned path.
const BASE_URL = "https://api.ransomware.live/v2";

/**
 * Unique key for a victim.
 *
 * v2 provides a `url` field — the public ransomware.live page, e.g.
 * "https://www.ransomware.live/id/TUVESUNPU0BicmF2b3g=" — whose base64
 * tail encodes "victim@group" and is therefore always present and unique.
 * The old approach keyed off the onion `post_url`/`claim_url`, but in v2
 * claim_url is empty for many victims (it would collapse them all to one
 * empty id), so we key off `url` instead.
 *
 * NOTE: this changes the id scheme, so existing rows (keyed the old way)
 * won't match new upserts. Existing victims are re-fetched fresh; a one-time
 * cleanup of the old rows is applied alongside this change.
 */
export function extractUid(v: Pick<RansomwareVictim, "url" | "claim_url">): string {
  if (v.url) return v.url;
  // Fallbacks if `url` is somehow missing: onion claim URL, else "".
  if (v.claim_url) return v.claim_url;
  return "";
}

export async function fetchRecentVictims(): Promise<RansomwareVictim[]> {
  const res = await fetch(`${BASE_URL}/recentvictims`, {
    headers: { "User-Agent": "shefutech-newshub/1.0" },
  });
  if (!res.ok) throw new Error(`ransomware.live /recentvictims → ${res.status}`);
  return res.json() as Promise<RansomwareVictim[]>;
}

export async function fetchVictimsByMonth(year: number, month: number): Promise<RansomwareVictim[]> {
  const m = String(month).padStart(2, "0");
  const res = await fetch(`${BASE_URL}/victims/${year}/${m}`, {
    headers: { "User-Agent": "shefutech-newshub/1.0" },
  });
  if (!res.ok) throw new Error(`ransomware.live /victims/${year}/${m} → ${res.status}`);
  return res.json() as Promise<RansomwareVictim[]>;
}

export function isJapan(country: string): boolean {
  const v = (country ?? "").toLowerCase().trim();
  return v === "jp" || v === "japan" || v === "日本";
}

export function fmtDate(d: string, lang: string): string {
  if (!d) return "—";
  const dt = new Date(d);
  if (isNaN(dt.getTime())) return d;
  return dt.toLocaleDateString(lang === "ja" ? "ja-JP" : "en-US", {
    year: "numeric", month: "short", day: "numeric",
  });
}

const GROUP_NAMES: Record<string, string> = {
  lockbit3:    "LockBit 3.0",
  lockbit:     "LockBit",
  alphv:       "ALPHV/BlackCat",
  blackcat:    "ALPHV/BlackCat",
  clop:        "Cl0p",
  cl0p:        "Cl0p",
  play:        "Play",
  akira:       "Akira",
  "8base":     "8Base",
  ransomhub:   "RansomHub",
  rhysida:     "Rhysida",
  medusa:      "Medusa",
  qilin:       "Qilin",
  dragonforce: "DragonForce",
  hunters:     "Hunters International",
};

export function groupDisplayName(raw: string): string {
  return GROUP_NAMES[raw?.toLowerCase()] ?? raw ?? "Unknown";
}
