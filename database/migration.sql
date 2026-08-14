-- =====================================================================
-- NewsHub Migration
-- =====================================================================
-- ADDITIVE migration on top of your existing schema (articles, tags,
-- article_tags, raw_feeds). Existing data is preserved.
--
-- Run with:
--   wrangler d1 execute newshub --file=database/migration.sql --remote
-- =====================================================================

-- ---- 1. Add RAG linkage columns to articles ------------------------
-- SQLite's ALTER TABLE has no IF NOT EXISTS; safe to ignore if columns
-- already exist (the statement will error but the rest will continue
-- when run with `--file` per-statement). Comment out lines you've
-- already applied.

ALTER TABLE articles ADD COLUMN vector_id TEXT;
ALTER TABLE articles ADD COLUMN embedded_at TEXT;

-- ---- 2. Indexes for the filter queries the UI runs ----------------
CREATE INDEX IF NOT EXISTS idx_articles_cat_pub        ON articles(category, published_at DESC);
CREATE INDEX IF NOT EXISTS idx_articles_cat_region     ON articles(category, region, published_at DESC);
CREATE INDEX IF NOT EXISTS idx_articles_cat_sub        ON articles(category, subcategory, published_at DESC);
CREATE INDEX IF NOT EXISTS idx_articles_pub            ON articles(published_at DESC);
CREATE INDEX IF NOT EXISTS idx_articles_importance     ON articles(importance_score DESC, published_at DESC);
CREATE INDEX IF NOT EXISTS idx_articles_vector         ON articles(vector_id);

CREATE INDEX IF NOT EXISTS idx_article_tags_article    ON article_tags(article_id);
CREATE INDEX IF NOT EXISTS idx_article_tags_tag        ON article_tags(tag_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_article_tags_uniq ON article_tags(article_id, tag_id);

-- ---- 3. RAG runtime config (override lib/rag/config.ts defaults) --
-- Editing rows here lets you tune RAG without redeploying.
CREATE TABLE IF NOT EXISTS rag_config (
  key         TEXT PRIMARY KEY,
  value       TEXT NOT NULL,
  updated_at  TEXT DEFAULT CURRENT_TIMESTAMP
);

INSERT OR IGNORE INTO rag_config (key, value) VALUES
  ('top_k',            '6'),
  ('min_score',        '0.55'),
  ('embedding_model',  '@cf/baai/bge-base-en-v1.5'),
  ('llm_model',        '@cf/meta/llama-3.1-8b-instruct'),
  ('temperature',      '0.3'),
  ('max_tokens',       '768');


-- ---- 4. Chat history (optional, useful for analytics) ------------
CREATE TABLE IF NOT EXISTS chat_messages (
  id            TEXT PRIMARY KEY,
  session_id    TEXT NOT NULL,
  role          TEXT NOT NULL CHECK (role IN ('user','assistant','system')),
  content       TEXT NOT NULL,
  context       TEXT,                               -- JSON
  sources       TEXT,                               -- JSON
  created_at    TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_chat_session ON chat_messages(session_id, created_at);

-- ---- 5. Article scraping flag (2025-xx) ---------------------------
-- scraped_at: set when full-text scrape succeeds; NULL = not yet scraped
ALTER TABLE articles ADD COLUMN scraped_at TEXT;
CREATE INDEX IF NOT EXISTS idx_articles_scraped ON articles(scraped_at);

-- ---- 6. Ransomware victim cache (2025-xx) --------------------------
CREATE TABLE IF NOT EXISTS ransomware_victims (
  id          INTEGER PRIMARY KEY,    -- ransomware.live numeric ID
  victim      TEXT NOT NULL,
  group_name  TEXT,
  country     TEXT,
  activity    TEXT,
  website     TEXT,
  description TEXT,
  post_url    TEXT,
  discovered  TEXT,
  published   TEXT,
  fetched_at  TEXT DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_rw_country   ON ransomware_victims(country);
CREATE INDEX IF NOT EXISTS idx_rw_published ON ransomware_victims(published);

-- ---- 7. Related articles (duplicate/same-story detection) -----------
-- Populated by the embed pipeline: after embedding a new article, it
-- searches Vectorize for recent (<=72h), same-category articles above a
-- similarity threshold and records them here. One-directional (newer ->
-- older); the UI joins both directions so either article shows the link.
CREATE TABLE IF NOT EXISTS related_articles (
  article_id  TEXT NOT NULL,   -- the newer article that triggered the match
  related_id  TEXT NOT NULL,   -- the earlier, similar article
  score       REAL NOT NULL,
  created_at  TEXT DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (article_id, related_id)
);
CREATE INDEX IF NOT EXISTS idx_related_article ON related_articles(article_id);
CREATE INDEX IF NOT EXISTS idx_related_related ON related_articles(related_id);
