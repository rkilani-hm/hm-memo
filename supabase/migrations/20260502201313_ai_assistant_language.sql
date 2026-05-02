-- =====================================================================
-- AI Assistant language preference
--
-- Why
-- ===
-- The AI Assistant panel (src/components/memo/AiApprovalSummary.tsx)
-- now supports producing its analysis in either English or Arabic.
-- Users can toggle the language from the panel header, but we want the
-- choice to persist across devices and sessions, not just live in the
-- browser's localStorage. Stored on the profile so the user's
-- preference syncs everywhere they sign in.
--
-- Schema
-- ======
--   ai_assistant_language  TEXT NOT NULL DEFAULT 'en'
--                          CHECK constrains values to 'en' or 'ar'.
--
-- Default 'en' so all existing users see English (today's behavior)
-- with no surprise on the next sign-in.
-- =====================================================================

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS ai_assistant_language TEXT NOT NULL DEFAULT 'en';

-- Use DO block so re-running the migration doesn't error if the
-- constraint already exists.
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
