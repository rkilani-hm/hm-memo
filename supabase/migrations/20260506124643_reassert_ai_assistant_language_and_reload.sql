-- =====================================================================
-- Re-assert profiles.ai_assistant_language column + reload schema cache
-- =====================================================================
--
-- A user (mibrahim@alhamra.com.kw) reported that saving their initials
-- on the Settings page fails with:
--   "Could not find the 'ai_assistant_language' column of 'profiles'
--    in the schema cache"
--
-- Why initials specifically broke: Settings.tsx saves ALL profile
-- fields in one UPDATE call. ai_assistant_language is included in
-- that payload. If the column is missing (or the schema cache hasn't
-- noticed it), the whole UPDATE fails — even though the user only
-- changed their initials.
--
-- Two scenarios this addresses:
--
-- 1. Column never made it to production
-- ---------------------------------------
-- The original migration (20260502201313_ai_assistant_language.sql)
-- exists in git but may not have been applied to the production DB
-- if Lovable's sync skipped it for any reason. The IF NOT EXISTS
-- guard means re-running it is safe — adds the column if missing,
-- no-op if already present.
--
-- 2. Column exists but PostgREST schema cache is stale
-- -----------------------------------------------------
-- Supabase's PostgREST API caches the schema. If a column was added
-- but the cache wasn't reloaded, queries that reference the column
-- get the "schema cache" error even though the column physically
-- exists. NOTIFY pgrst forces a reload.
--
-- We do BOTH in this migration so whichever scenario applies, it's
-- resolved.
-- =====================================================================

BEGIN;

-- 1. Re-assert the column (idempotent)
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS ai_assistant_language TEXT NOT NULL DEFAULT 'en';

-- 2. Re-assert the CHECK constraint (idempotent)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'profiles_ai_assistant_language_check'
  ) THEN
    ALTER TABLE public.profiles
      ADD CONSTRAINT profiles_ai_assistant_language_check
      CHECK (ai_assistant_language IN ('en', 'ar'));
  END IF;
END $$;

COMMIT;

-- 3. Force PostgREST to reload its schema cache. This is what fixes
-- the "schema cache" error if the column already exists but was added
-- without a cache reload. NOTIFY runs outside the transaction.
NOTIFY pgrst, 'reload schema';
