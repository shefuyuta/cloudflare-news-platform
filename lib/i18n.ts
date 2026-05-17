// lib/i18n.ts
// ---------------------------------------------------------------------
// Minimal i18n: all UI strings in one file. Language is stored in a
// cookie ("lang") and read by both server and client components.
// ---------------------------------------------------------------------

export type Lang = "ja" | "en";
export const DEFAULT_LANG: Lang = "ja";
export const LANG_COOKIE = "newshub-lang";

const T = {
  // ---- Brand / Layout -----------------------------------------------
  brand:            { en: "shefutech News Hub", ja: "shefutech News Hub" },
  editionDate:      { en: "Edition", ja: "Edition" },
  poweredBy:        { en: "AI-augmented news desk\npowered by Cloudflare", ja: "AI連携ニュースデスク\npowered by Cloudflare" },
  crossCuts:        { en: "Cross-cuts", ja: "クロスカット" },

  // ---- Nav ----------------------------------------------------------
  navLatest:        { en: "Latest",        ja: "最新" },
  navLatestSub:     { en: "All latest",    ja: "すべての最新" },
  navGeneral:       { en: "General",       ja: "一般ニュース" },
  navGeneralSub:    { en: "General News",  ja: "政治・経済・災害" },
  navCyber:         { en: "Cybersecurity", ja: "サイバーセキュリティ" },
  navCyberSub:      { en: "Security News", ja: "脆弱性・インシデント" },
  navAI:            { en: "AI",            ja: "AI" },
  navAISub:         { en: "AI News",       ja: "人工知能ニュース" },
  navImportant:     { en: "Important",     ja: "重要" },
  navImportantSub:  { en: "High priority", ja: "重要記事のみ" },

  // ---- Page headings ------------------------------------------------
  frontPage:        { en: "HOME",    ja: "HOME" },
  todaysEdition:    { en: "The latest News", ja: "最新のニュース" },
  todaysEditionSub: { en: "Latest from across General, Cybersecurity, and AI desks.",
                      ja: "一般・サイバーセキュリティ・AIの最新記事。" },
  desk:             { en: "Section",          ja: "セクション" },
  crossCut:         { en: "Overall",     ja: "全体" },

  generalTitle:     { en: "General",       ja: "一般ニュース" },
  generalSub:       { en: "Major events, geopolitics, politics, economy, business.",
                      ja: "大きな事件、地政学、政治、経済、ビジネス。" },
  cyberTitle:       { en: "Cybersecurity", ja: "サイバーセキュリティ" },
  cyberSub:         { en: "Vulnerabilities, incidents, and the rest.",
                      ja: "脆弱性、インシデント、その他。" },
  aiTitle:          { en: "AI",            ja: "AI" },
  aiSub:            { en: "Model releases, research, deployments, and policy.",
                      ja: "モデルリリース、研究、デプロイ、政策。" },
  importantTitle:   { en: "Important",     ja: "重要記事" },
  importantSub:     { en: "High-importance stories across every desk",
                      ja: "全デスクの重要記事" },

  // ---- Filters ------------------------------------------------------
  all:              { en: "All",           ja: "すべて" },
  tags:             { en: "Tags",          ja: "タグ" },
  searchPlaceholder:{ en: "Search headlines, tags, sources…",
                      ja: "見出し・タグ・ソースを検索…" },

  // ---- Time range ---------------------------------------------------
  timeRange:        { en: "Time range",    ja: "取得範囲" },
  hours24:          { en: "24h",           ja: "24時間" },
  hours48:          { en: "48h",           ja: "48時間" },
  hours72:          { en: "72h",           ja: "72時間" },
  week1:            { en: "1 week",        ja: "1週間" },

  // ---- Region / Subcategory tabs ------------------------------------
  regionJapan:      { en: "Japan",         ja: "日本" },
  regionUS:         { en: "US",            ja: "アメリカ" },
  regionAsia:       { en: "Asia",          ja: "アジア" },
  regionEurope:     { en: "Europe",        ja: "ヨーロッパ" },
  regionOther:      { en: "Other",         ja: "その他" },
  subVulnerability: { en: "Vulnerability", ja: "脆弱性" },
  subIncident:      { en: "Incident",      ja: "インシデント" },
  subOther:         { en: "Other",         ja: "その他" },

  // ---- Empty state --------------------------------------------------
  noArticles:       { en: "No articles match the current filters.",
                      ja: "条件に一致する記事がありません。" },
  noArticlesSub:    { en: "Try clearing tags or switching tabs.",
                      ja: "タグをクリアするか、タブを切り替えてみてください。" },

  // ---- Chat ---------------------------------------------------------
  askNewsHub:       { en: "Ask NewsHub",   ja: "NewsHub AIに質問" },
  chatTitle:        { en: "NewsHub Assistant", ja: "NewsHubアシスタント" },
  chatScope:        { en: "Scope",         ja: "スコープ" },
  chatAllNews:      { en: "all news",      ja: "全ニュース" },
  chatPlaceholder:  { en: "Ask about your current view…",
                      ja: "現在の表示内容について質問…" },
  chatSend:         { en: "Send",          ja: "送信" },
  chatSources:      { en: "Sources",       ja: "ソース" },
  chatEmpty:        { en: "Ask anything about the articles in your current view. Sources are cited.",
                      ja: "現在の記事について何でも質問できます。情報ソース付きで回答します。" },
} as const;

export type TKey = keyof typeof T;

/** Get a translated string. */
export function t(key: TKey, lang: Lang): string {
  return T[key]?.[lang] ?? T[key]?.en ?? key;
}

/** Read lang from cookie string (server-side). */
export function langFromCookies(cookieHeader: string | null): Lang {
  if (!cookieHeader) return DEFAULT_LANG;
  const match = cookieHeader.match(new RegExp(`${LANG_COOKIE}=(ja|en)`));
  return (match?.[1] as Lang) ?? DEFAULT_LANG;
}
