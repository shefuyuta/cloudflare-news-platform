-- database/cleanup-index-headings.sql
-- ---------------------------------------------------------------------
-- Remove feed-index / "table of contents" pseudo-articles that some
-- sources (MainichiJP) emit as normal RSS items, e.g.
--   "■■ 主要ニュース ■■■■◇TOP◇■■"
-- These carry no article content and are meaningless in the UI.
--
-- article_tags has NO foreign key / ON DELETE CASCADE, so deleting from
-- articles alone would leave orphan tag links. We delete the tag links
-- first, then the articles, in one run.
--
-- Match pattern: title LIKE '%◇TOP◇%'. Verified against the live rows —
-- catches all three section headings and no genuine article (a bare
-- "TOP" or a stray "◇" in a real headline does not match).
--
-- Run (remote):
--   npx wrangler d1 execute newshub --remote --file database/cleanup-index-headings.sql
-- ---------------------------------------------------------------------

-- 1. Remove tag links belonging to the doomed articles.
DELETE FROM article_tags
WHERE article_id IN (
  SELECT id FROM articles WHERE title LIKE '%◇TOP◇%'
);

-- 2. Remove the index-heading articles themselves.
DELETE FROM articles
WHERE title LIKE '%◇TOP◇%';
