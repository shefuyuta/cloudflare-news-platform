// lib/ransomware.ts
// Types and fetch logic for ransomware.live API.

export interface RansomwareVictim {
  id:          number;
  victim:      string;
  group:       string;       // threat actor group name
  country:     string;       // ISO 3166-1 alpha-2 (e.g. "JP")
  activity:    string;       // industry / sector
  website:     string;
  description: string;
  post_url:    string;       // dark web post URL
  discovered:  string;       // YYYY-MM-DD
  published:   string;       // ISO datetime
}

export interface VictimWithNews {
  id:            number;
  victim:        string;
  group:         string;
  groupDisplay:  string;
  activity:      string;
  website:       string;
  description:   string;
  post_url:      string;
  discovered:    string;
  discoveredFmt: string;
  relatedNews: {
    id: string;
    title: string;
    url: string;
    source: string;
    publishedAt: string;
  }[];
}

const BASE_URL = "https://api.ransomware.live";

/** Fetch recent victims (last ~100) from ransomware.live */
export async function fetchRecentVictims(): Promise<RansomwareVictim[]> {
  const res = await fetch(`${BASE_URL}/recentvictims`, {
    headers: { "User-Agent": "shefutech-newshub/1.0" },
  });
  if (!res.ok) throw new Error(`ransomware.live ${res.status}`);
  return res.json() as Promise<RansomwareVictim[]>;
}

/** Fetch victims for a specific year/month */
export async function fetchVictimsByMonth(year: number, month: number): Promise<RansomwareVictim[]> {
  const m = String(month).padStart(2, "0");
  const res = await fetch(`${BASE_URL}/victims/${year}/${m}`, {
    headers: { "User-Agent": "shefutech-newshub/1.0" },
  });
  if (!res.ok) throw new Error(`ransomware.live ${res.status}`);
  return res.json() as Promise<RansomwareVictim[]>;
}

/** Normalize country code — ransomware.live uses full names in some fields */
export function isJapan(country: string): boolean {
  const v = country?.toLowerCase() ?? "";
  return v === "jp" || v === "japan" || v === "日本";
}

/** Format discovered date for display */
export function fmtDate(d: string, lang: string): string {
  const dt = new Date(d);
  if (isNaN(dt.getTime())) return d;
  return dt.toLocaleDateString(lang === "ja" ? "ja-JP" : "en-US", {
    year: "numeric", month: "short", day: "numeric",
  });
}

/** Map ransomware group name → well-known display name */
export function groupDisplayName(raw: string): string {
  const map: Record<string, string> = {
    lockbit3: "LockBit 3.0",
    lockbit:  "LockBit",
    alphv:    "ALPHV/BlackCat",
    blackcat: "ALPHV/BlackCat",
    clop:     "Cl0p",
    cl0p:     "Cl0p",
    play:     "Play",
    akira:    "Akira",
    "8base":  "8Base",
    hunters:  "Hunters International",
    medusa:   "Medusa",
    ransomhub: "RansomHub",
    rhysida:  "Rhysida",
    qilin:    "Qilin",
    dragonforce: "DragonForce",
  };
  return map[raw?.toLowerCase()] ?? raw;
}
