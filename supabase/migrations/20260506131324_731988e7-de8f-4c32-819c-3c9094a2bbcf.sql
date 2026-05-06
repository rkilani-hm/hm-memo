ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS ai_assistant_language TEXT NOT NULL DEFAULT 'en';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'profiles_ai_assistant_language_check'
  ) THEN
    ALTER TABLE public.profiles
      ADD CONSTRAINT profiles_ai_assistant_language_check
      CHECK (ai_assistant_language IN ('en', 'ar'));
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';