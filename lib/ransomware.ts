// lib/ransomware.ts
// Types and fetch logic for ransomware.live API.
// Field names verified against actual API response (2025-05).

export interface RansomwareVictim {
  // Unique identifier — extracted from post_url UUID
  // (API doesn't return a top-level id field)
  post_url:    string;
  post_title:  string;    // victim / organization name
  group_name:  string;    // threat actor group
  country:     string;    // ISO 3166-1 alpha-2 e.g. "JP"
  activity:    string;    // industry / sector
  website:     string;
  description: string;
  discovered:  string;    // ISO datetime
  published:   string;    // ISO datetime
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
  post_url:     string;
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

const BASE_URL = "https://api.ransomware.live";

/** Extract a unique key from post_url.
 *  Tries: ?uuid= param → path UUID → hash fragment → full URL
 */
export function extractUid(post_url: string): string {
  if (!post_url) return "";
  // Pattern 1: ?uuid=xxxxxxxx-xxxx-...
  const qm = post_url.match(/[?&]uuid=([0-9a-f-]{36})/i);
  if (qm) return qm[1];
  // Pattern 2: /posts/xxxxxxxx-xxxx-... (path segment UUID)
  const pm = post_url.match(/\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})(?:[/?#]|$)/i);
  if (pm) return pm[1];
  // Pattern 3: #fragment or full URL as fallback (still unique)
  return post_url;
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
