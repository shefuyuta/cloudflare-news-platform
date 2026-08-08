-- database/migrate-ransomware-v2.sql
-- ---------------------------------------------------------------------
-- Migrate ransomware_victims for the ransomware.live API v2 switch.
--
-- Two changes:
--   1. Add a `public_url` column (v2's public ransomware.live page URL,
--      e.g. https://www.ransomware.live/id/<base64>), used for UI linking
--      alongside the existing onion post_url.
--   2. Clear existing rows. The victim id scheme changes with v2 (id is now
--      the public `url` field, base64-encoded victim@group, instead of the
--      onion-URL UUID), so old rows would never be updated by new upserts
--      and would linger as stale duplicates. They are re-fetched fresh on
--      the next run (recentvictims + up to 6 monthly snapshots), so clearing
--      is safe and avoids mixed id schemes.
--
-- Run (remote):
--   npx wrangler d1 execute newshub --remote --file database/migrate-ransomware-v2.sql
--
-- ADD COLUMN is not idempotent in SQLite (errors if the column already
-- exists). If you have already run this once, skip step 1 / comment it out.
-- ---------------------------------------------------------------------

-- 1. Add the public_url column (safe default empty string).
ALTER TABLE ransomware_victims ADD COLUMN public_url TEXT DEFAULT '';

-- 2. Clear old-id-scheme rows so v2 upserts start clean.
DELETE FROM ransomware_victims;
