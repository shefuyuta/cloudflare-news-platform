// workers/fetcher/feeds.ts
// ---------------------------------------------------------------------
// All RSS/Atom feed URLs organized by category.
// Source: user's existing config.py / config_ai_news.py
// ---------------------------------------------------------------------

export interface FeedSource {
  name: string;
  urls: string[];
  category: "general" | "cybersecurity" | "ai";
  /** Hint for region classification (general only). */
  regionHint?: string;
  /** Hint for subcategory (cybersecurity only). */
  subHint?: string;
}

export const FEEDS: FeedSource[] = [

  // =====================================================================
  // GENERAL NEWS
  // =====================================================================
  {
    name: "CNN",
    category: "general",
    regionHint: "us",
    urls: [
      "https://rss.cnn.com/rss/cnn_topstories.rss",
      "https://rss.cnn.com/rss/cnn_world.rss",
      "https://rss.cnn.com/rss/money_latest.rss",
    ],
  },
  {
    name: "BBC",
    category: "general",
    regionHint: "europe",
    urls: [
      "https://feeds.bbci.co.uk/news/rss.xml",
      "https://feeds.bbci.co.uk/news/world/rss.xml",
      "https://feeds.bbci.co.uk/news/business/rss.xml",
    ],
  },
  {
    name: "Guardian",
    category: "general",
    urls: [
      "https://www.theguardian.com/world/rss",
      "https://www.theguardian.com/business/rss",
      "https://www.theguardian.com/world/middleeast/rss",
      "https://www.theguardian.com/world/asia/rss",
      "https://www.theguardian.com/world/europe-news/rss",
      "https://www.theguardian.com/us-news/rss",
    ],
  },
  {
    name: "AP",
    category: "general",
    urls: [
      "http://hosted2.ap.org/atom/APDEFAULT/3d281c11a96b4ad082fe88aa0db04305",
      "http://hosted2.ap.org/atom/APDEFAULT/cae69a7523db45408eeb2b3a98c0c9c5",
    ],
  },
  {
    name: "Reuters",
    category: "general",
    urls: [
      "http://feeds.reuters.com/reuters/topNews",
      "http://feeds.reuters.com/reuters/worldNews",
      "http://feeds.reuters.com/reuters/businessNews",
    ],
  },
  {
    name: "JapanTimes",
    category: "general",
    regionHint: "japan",
    urls: [
      "https://www.japantimes.co.jp/feed/",
    ],
  },
  {
    name: "MainichiJP",
    category: "general",
    regionHint: "japan",
    urls: [
      "https://mainichi.jp/rss/etc/mainichi-flash.rss",
      "https://mainichi.jp/rss/etc/mainichi.rss",
    ],
  },

  // =====================================================================
  // CYBERSECURITY
  // =====================================================================
  // --- Japan ---
  {
    name: "SecurityNext",
    category: "cybersecurity",
    regionHint: "japan",
    urls: [
      "https://www.security-next.com/feed",
    ],
  },
  {
    // piyokango's individual security blog — one of the most-followed
    // security professionals in Japan, known for detailed, well-sourced
    // write-ups of domestic and international incidents (and increasingly,
    // AI-related security topics: prompt injection, AI-generated fake CVEs,
    // AI agent misbehavior, etc.), each citing its original sources.
    // Hatena Blog serves a standard RSS feed at /rss (confirmed UTF-8,
    // no Cloudflare IP blocking observed unlike some other JP sources).
    name: "piyolog",
    category: "cybersecurity",
    regionHint: "japan",
    urls: [
      "https://piyolog.hatenadiary.jp/rss",
    ],
  },
  {
    name: "ITmedia Security",
    category: "cybersecurity",
    regionHint: "japan",
    urls: [
      "https://rss.itmedia.co.jp/rss/2.0/news_security.xml",
    ],
  },
  {
    name: "ITmedia NEWS",
    category: "general",
    regionHint: "japan",
    urls: [
      "https://rss.itmedia.co.jp/rss/2.0/news_bursts.xml",
    ],
  },
  {
    name: "ITmedia AI＋",
    category: "ai",
    regionHint: "japan",
    urls: [
      "https://rss.itmedia.co.jp/rss/2.0/aiplus.xml",
    ],
  },
  {
    name: "JPCERT/CC",
    category: "cybersecurity",
    regionHint: "japan",
    subHint: "vulnerability",
    urls: [
      "https://blogs.jpcert.or.jp/atom.xml",
      "https://www.jpcert.or.jp/english/rss/jpcert-en.rdf",
    ],
  },
  {
    name: "JVN",
    category: "cybersecurity",
    regionHint: "japan",
    subHint: "vulnerability",
    urls: [
      "https://jvndb.jvn.jp/ja/rss/jvndb_new.rdf",
      "https://jvndb.jvn.jp/ja/rss/jvndb.rdf",
    ],
  },
  {
    name: "Hitachi HIRT",
    category: "cybersecurity",
    regionHint: "japan",
    urls: [
      "http://www.hitachi.co.jp/hirt/security/index.rdf",
    ],
  },
  // --- Global ---
  {
    name: "The Hacker News",
    category: "cybersecurity",
    urls: [
      "https://thehackernews.com/rss.xml",
    ],
  },
  {
    name: "KrebsOnSecurity",
    category: "cybersecurity",
    urls: [
      "https://krebsonsecurity.com/feed/",
    ],
  },
  {
    name: "HelpNetSecurity",
    category: "cybersecurity",
    urls: [
      "https://www.helpnetsecurity.com/feed/",
    ],
  },
  {
    name: "Ars Technica",
    category: "cybersecurity",
    urls: [
      "https://feeds.arstechnica.com/arstechnica/index",
    ],
  },
  {
    name: "RedPacketSecurity",
    category: "cybersecurity",
    subHint: "incident",
    urls: [
      "https://www.redpacketsecurity.com/category/ransomware/feed/",
    ],
  },
  {
    name: "LevelBlue",
    category: "cybersecurity",
    urls: [
      "https://www.levelblue.com/blogs/spiderlabs-blog/rss.xml",
    ],
  },
  {
    name: "IPA",
    category: "cybersecurity",
    regionHint: "japan",
    subHint: "vulnerability",
    urls: [
      "https://www.ipa.go.jp/security/alert-rss.rdf",
    ],
  },
  {
    name: "RocketBoys SecurityLab",
    category: "cybersecurity",
    regionHint: "japan",
    urls: [
      "https://rocket-boys.co.jp/security-measures-lab/feed/",
    ],
  },

  // =====================================================================
  // AI NEWS
  // =====================================================================
  {
    name: "Reuters Tech",
    category: "ai",
    urls: [
      "https://feeds.reuters.com/reuters/technologyNews",
    ],
  },
  {
    name: "AP Tech",
    category: "ai",
    urls: [
      "https://apnews.com/hub/artificial-intelligence/rss",
    ],
  },
  {
    name: "BBC Tech",
    category: "ai",
    urls: [
      "https://feeds.bbci.co.uk/news/technology/rss.xml",
    ],
  },
  {
    name: "TechCrunch AI",
    category: "ai",
    urls: [
      "https://techcrunch.com/category/artificial-intelligence/feed/",
    ],
  },
  {
    name: "VentureBeat AI",
    category: "ai",
    urls: [
      "https://venturebeat.com/ai/feed/",
    ],
  },
  {
    name: "OpenAI Blog",
    category: "ai",
    urls: [
      "https://openai.com/news/rss.xml",
    ],
  },
  {
    name: "Anthropic Blog",
    category: "ai",
    urls: [
      "https://www.anthropic.com/news/rss.xml",
    ],
  },
  {
    name: "Hugging Face Blog",
    category: "ai",
    urls: [
      "https://huggingface.co/blog/feed.xml",
    ],
  },
  {
    name: "Wired AI",
    category: "ai",
    urls: [
      "https://www.wired.com/feed/tag/ai/latest/rss",
    ],
  },
  {
    name: "Nikkei Asia",
    category: "general",
    regionHint: "asia",
    urls: [
      "https://asia.nikkei.com/rss/feed/nar",
    ],
  },
  {
    name: "Forbes Innovation",
    category: "ai",
    urls: [
      "https://www.forbes.com/innovation/feed/",
    ],
  },
  {
    name: "Bloomberg Tech",
    category: "ai",
    urls: [
      "https://feeds.bloomberg.com/technology/news.rss",
    ],
  },
  {
    name: "Forbes Business",
    category: "general",
    urls: [
      "https://www.forbes.com/business/feed/",
    ],
  },
  {
    name: "ToyoKeizai",
    category: "general",
    regionHint: "japan",
    urls: [
      "https://toyokeizai.net/list/feed/rss",
    ],
  },
];
