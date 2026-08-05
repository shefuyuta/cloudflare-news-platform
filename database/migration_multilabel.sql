-- =====================================================================
-- NewsHub Migration — Multi-label + Importance removal (Phase 1)
-- =====================================================================
-- Run AFTER the base migration.sql, with:
--   wrangler d1 execute newshub --file=database/migration_multilabel.sql --remote
--
-- This migration is idempotent-ish: statements that may fail if already
-- applied are annotated. Run them individually if a batch aborts.
-- =====================================================================

-- ---- 1. Drop the importance_score column ---------------------------
-- The importance scoring system (/important page, score-articles API,
-- Slack/email briefing, importance sort) has been permanently removed.
--
-- ORDER MATTERS: drop the index that references the column FIRST, then
-- drop the column. SQLite refuses to drop a column while an index still
-- depends on it. D1 supports DROP COLUMN. If DROP COLUMN errors with
-- "no such column", it was already dropped — safe to skip.
DROP INDEX IF EXISTS idx_articles_importance;
ALTER TABLE articles DROP COLUMN importance_score;

-- ---- 2. Backfill sub:* tags for existing cyber articles ------------
-- New articles get sub:vulnerability / sub:incident tags at ingest time
-- (multi-label). Existing rows only have the single `subcategory`
-- column, so the /cybersecurity subcategory tabs (which now filter by
-- sub:* tags) would show nothing for old data. This backfill creates
-- the tag rows and links from the legacy subcategory column.
--
-- NOTE: this only migrates the SINGLE legacy value per article. To get
-- true multi-label on historical rows (e.g. an old article that is both
-- vuln AND incident), re-run a fetch or a dedicated re-classification
-- pass. For going-forward correctness, ingest handles it automatically.

INSERT OR IGNORE INTO tags (name)
SELECT DISTINCT 'sub:' || subcategory
FROM articles
WHERE category = 'cybersecurity'
  AND subcategory IN ('vulnerability', 'incident', 'other');

INSERT OR IGNORE INTO article_tags (article_id, tag_id)
SELECT a.id, t.id
FROM articles a
JOIN tags t ON t.name = 'sub:' || a.subcategory
WHERE a.category = 'cybersecurity'
  AND a.subcategory IN ('vulnerability', 'incident', 'other');

-- ---- 3. (Optional) Backfill AI/Cyber cross-labels ------------------
-- Historical rows have no cross-labels, so a legacy cyber-AI story
-- won't appear on both desks until re-classified. There is no reliable
-- SQL-only way to recompute keyword scores; the going-forward path is
-- the updated classifier. If you want historical cross-labels, trigger
-- a re-fetch (ON CONFLICT updates category + re-runs tagging via the
-- ingest path) rather than trying to patch it in SQL here.
