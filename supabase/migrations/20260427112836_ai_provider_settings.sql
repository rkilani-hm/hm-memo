-- =====================================================================
-- AI provider configuration (OpenAI / Lovable / fallback)
--
-- Adds columns to fraud_settings so an admin can pick which AI provider
-- powers the fraud detection + memo summary functions, plus a column on
-- memo_fraud_runs to record which provider actually answered for each run
-- (useful when fallback fired).
-- =====================================================================

ALTER TABLE public.fraud_settings
  ADD COLUMN IF NOT EXISTS ai_provider           text NOT NULL DEFAULT 'lovable'
    CHECK (ai_provider IN ('openai', 'lovable', 'openai_then_lovable')),
  ADD COLUMN IF NOT EXISTS ai_model_summary      text,                          -- e.g. 'gpt-4o-mini'
  ADD COLUMN IF NOT EXISTS ai_model_fraud        text,                          -- e.g. 'gpt-4o'
  ADD COLUMN IF NOT EXISTS ai_lovable_fallback   boolean NOT NULL DEFAULT true; -- when ai_provider='openai', do we still fall back?

ALTER TABLE public.memo_fraud_runs
  ADD COLUMN IF NOT EXISTS ai_provider_used      text,
  ADD COLUMN IF NOT EXISTS ai_model_used         text;

COMMENT ON COLUMN public.fraud_settings.ai_provider IS
  'Which AI provider powers fraud-check and memo-ai-summary. ''openai'' uses OpenAI''s API directly (requires OPENAI_API_KEY secret). ''lovable'' uses the existing Lovable AI gateway (requires LOVABLE_API_KEY). ''openai_then_lovable'' tries OpenAI first and falls back to Lovable if OpenAI fails.';

COMMENT ON COLUMN public.fraud_settings.ai_model_summary IS
  'Override model name for memo-ai-summary calls. Default per-provider: openai=gpt-4o-mini, lovable=google/gemini-2.5-flash.';

COMMENT ON COLUMN public.fraud_settings.ai_model_fraud IS
  'Override model name for memo-fraud-check vision calls. Default per-provider: openai=gpt-4o, lovable=google/gemini-2.5-flash.';

COMMENT ON COLUMN public.memo_fraud_runs.ai_provider_used IS
  'Which provider actually answered for this run (may differ from configured ai_provider when fallback fired).';
