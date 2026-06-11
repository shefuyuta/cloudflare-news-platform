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


  {
    name: "Bloomberg General",
    category: "general",
    urls: [
      "https://feeds.bloomberg.com/markets/news.rss",
      "https://feeds.bloomberg.com/economics/news.rss",
      "https://feeds.bloomberg.com/politics/news.rss",
    ],
  },
  {
    name: "Forbes General",
    category: "general",
    urls: [
      "https://www.forbes.com/markets/index.xml",
      "https://www.forbes.com/money/index.xml",
    ],
  },

  // --- Japan General/Tech (via proxy) ---
  {
    name: "ZDNet Japan",
    category: "general",
    regionHint: "japan",
    useProxy: true,
    urls: ["https://japan.zdnet.com/index.rdf"],
  },
  {
    name: "CNET Japan",
    category: "general",
    regionHint: "japan",
    useProxy: true,
    urls: ["https://japan.cnet.com/index.rdf"],
  },
  {
    name: "Gigazine",
    category: "general",
    regionHint: "japan",
    useProxy: true,
    urls: ["https://gigazine.net/news/rss_2.0/"],
  },
  {
    name: "TechCrunch Japan",
    category: "general",
    regionHint: "japan",
    useProxy: true,
    urls: ["https://jp.techcrunch.com/feed/"],
  },
  {
    name: "Kyodo News",
    category: "general",
    regionHint: "japan",
    useProxy: true,
    urls: ["https://www.kyodo.co.jp/feed/"],
  },
  {
    name: "Toyo Keizai",
    category: "general",
    regionHint: "japan",
    useProxy: true,
    urls: ["https://toyokeizai.net/list/feed/rss"],
  },
  {
    name: "Nikkei Business",
    category: "general",
    regionHint: "japan",
    useProxy: true,
    urls: ["https://business.nikkei.com/rss/SNS/nb.rss"],
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
    name: "ITmedia Security",
    category: "cybersecurity",
    regionHint: "japan",
    urls: [
      "https://rss.itmedia.co.jp/rss/2.0/news_security.xml",
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

  // --- Japan Cybersecurity (additional, via proxy) ---
  {
    name: "Piyolog",
    category: "cybersecurity",
    regionHint: "japan",
    useProxy: true,
    urls: ["https://piyolog.hatenadiary.jp/rss"],
  },
  {
    name: "NTT Security JP",
    category: "cybersecurity",
    regionHint: "japan",
    useProxy: true,
    urls: ["https://jp.security.ntt/resources/blog/feed"],
  },
  {
    name: "ScanNetSecurity",
    category: "cybersecurity",
    regionHint: "japan",
    useProxy: true,
    urls: ["https://scan.netsecurity.ne.jp/rss/news.rdf"],
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

  // =====================================================================
  // AI NEWS
  // =====================================================================
  // --- Japan AI (via proxy) ---
  {
    name: "Ledge.ai",
    category: "ai",
    regionHint: "japan",
    useProxy: true,
    urls: ["https://ledge.ai/feed/"],
  },
  {
    name: "AI Market",
    category: "ai",
    regionHint: "japan",
    useProxy: true,
    urls: ["https://ai-market.jp/feed/"],
  },

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
    category: "ai",
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
];
