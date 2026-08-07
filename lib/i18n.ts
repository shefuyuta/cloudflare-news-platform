// lib/i18n.ts
export type Lang = "ja" | "en";
export const DEFAULT_LANG: Lang = "ja";
export const LANG_COOKIE = "newshub-lang";

const T = {
  // ---- Brand / Layout -----------------------------------------------
  brand:            { en: "shefutech News Hub", ja: "shefutech News Hub" },
  editionDate:      { en: "Edition", ja: "Edition" },
  poweredBy:        { en: "AI-augmented news desk\npowered by Cloudflare", ja: "AI連携ニュースデスク\npowered by Cloudflare" },

  // ---- Nav ----------------------------------------------------------
  navLatest:        { en: "Latest",        ja: "最新" },
  navSearch:        { en: "Search",        ja: "検索" },
  navSearchSub:     { en: "Full-text search", ja: "全文検索" },
  navLatestSub:     { en: "All latest",    ja: "すべての最新" },
  navDashboard:     { en: "Dashboard",     ja: "ダッシュボード" },
  navDashboardSub:  { en: "Overview",      ja: "統計・俯瞰" },
  navGeneral:       { en: "General",       ja: "一般ニュース" },
  navGeneralSub:    { en: "General News",  ja: "政治・経済・災害" },
  navCyber:         { en: "Cybersecurity", ja: "サイバーセキュリティ" },
  navCyberSub:      { en: "Security News", ja: "脆弱性・インシデント" },
  navAI:            { en: "AI",            ja: "AI" },
  navAISub:         { en: "AI News",       ja: "人工知能ニュース" },
  navRansomware:    { en: "Ransomware",     ja: "ランサムウェア被害" },
  navRansomwareSub: { en: "Victim tracker",  ja: "被害組織トラッカー" },

  // ---- Page headings ------------------------------------------------
  todaysEdition:    { en: "The latest News", ja: "最新のニュース" },
  todaysEditionSub: { en: "Latest from across General, Cybersecurity, and AI desks.",
                      ja: "一般・サイバーセキュリティ・AIの最新記事。" },
  desk:             { en: "Section",       ja: "セクション" },
  dashboardTitle:   { en: "Dashboard",     ja: "ダッシュボード" },
  dashboardSub:     { en: "News overview and statistics", ja: "ニュースの俯瞰と統計" },

  generalTitle:     { en: "General",       ja: "一般ニュース" },
  generalSub:       { en: "Major events, geopolitics, politics, economy, business.",
                      ja: "大きな事件、地政学、政治、経済、ビジネス。" },
  cyberTitle:       { en: "Cybersecurity", ja: "サイバーセキュリティ" },
  cyberSub:         { en: "Vulnerabilities, incidents, and the rest.",
                      ja: "脆弱性、インシデント、その他。" },
  aiTitle:          { en: "AI",            ja: "AI" },
  aiSub:            { en: "Model releases, research, deployments, and policy.",
                      ja: "モデルリリース、研究、デプロイ、政策。" },

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
  chatTemplates:    { en: "Quick questions:", ja: "クイック質問:" },

  // ---- Bookmark -----------------------------------------------------
  bookmark:         { en: "Bookmark",      ja: "ブックマーク" },
  bookmarked:       { en: "Bookmarked",    ja: "ブックマーク済み" },
  markRead:         { en: "Mark seen",     ja: "確認済みにする" },
  readArticle:      { en: "Seen",          ja: "確認済み" },

  // ---- Export -------------------------------------------------------
  exportCSV:        { en: "Export CSV",    ja: "CSV出力" },
  searchResultsFor: { en: "Search results for", ja: "検索結果：" },
  searchAll:        { en: "All time",      ja: "全期間" },
  searchHint:       { en: "Search across all articles — title, body, tags, source, category",
                      ja: "全記事を対象に検索 — タイトル・本文・タグ・ソース・カテゴリ" },
  searchEmpty:      { en: "No results. Try different keywords.", ja: "該当なし。別のキーワードをお試しください。" },
  filterBy:         { en: "Filter by",    ja: "絞り込み" },

  // ---- Dashboard ----------------------------------------------------
  totalArticles:    { en: "Total Articles", ja: "総記事数" },
  byCategory:       { en: "By Category",   ja: "カテゴリ別" },
  bySource:         { en: "By Source",      ja: "ソース別" },
  byRegion:         { en: "By Region",      ja: "地域別" },
  trendingTags:     { en: "Trending Tags",  ja: "トレンドタグ" },
  todaysBriefing:   { en: "Today's Briefing", ja: "本日のブリーフィング" },
  generateBriefing: { en: "Generate",      ja: "生成" },

  // ---- Notifications ------------------------------------------------
  alertKeywords:    { en: "Alert Keywords", ja: "アラートキーワード" },
  alertPlaceholder: { en: "Add keyword…",  ja: "キーワード追加…" },
  alertMatches:     { en: "new matches",   ja: "件の新着一致" },

  // ---- Mobile -------------------------------------------------------
  menu:             { en: "Menu",          ja: "メニュー" },
  close:            { en: "Close",         ja: "閉じる" },
} as const;

export type TKey = keyof typeof T;

export function t(key: TKey, lang: Lang): string {
  return T[key]?.[lang] ?? T[key]?.en ?? key;
}

export function langFromCookies(cookieHeader: string | null): Lang {
  if (!cookieHeader) return DEFAULT_LANG;
  const match = cookieHeader.match(new RegExp(`${LANG_COOKIE}=(ja|en)`));
  return (match?.[1] as Lang) ?? DEFAULT_LANG;
}
