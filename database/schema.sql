CREATE TABLE articles (
  id TEXT PRIMARY KEY,

  title TEXT NOT NULL,
  summary TEXT,
  content TEXT,

  category TEXT NOT NULL,
  subcategory TEXT,

  region TEXT,

  source TEXT,
  url TEXT UNIQUE,

  importance_score INTEGER,

  published_at TEXT,

  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE tags (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT UNIQUE
);

CREATE TABLE article_tags (
  article_id TEXT,
  tag_id INTEGER
);

CREATE TABLE raw_feeds (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  source TEXT,
  content TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);
