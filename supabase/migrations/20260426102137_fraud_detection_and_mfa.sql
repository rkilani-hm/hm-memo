-- =====================================================================
-- Fraud Detection + MFA Step-Up
-- Adds:
--   1. memo_fraud_signals  - per-attachment / per-memo forensic + business signals
--   2. memo_fraud_runs     - one row per AI fraud-check run (history of analyses)
--   3. fraud_settings      - admin-tunable thresholds and feature flags
--   4. approval_steps.mfa_*  - new MFA columns
--   5. profiles.azure_ad_oid + profiles.mfa_method
-- =====================================================================

-- 1) Per-signal table -------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.memo_fraud_signals (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  memo_id         uuid NOT NULL REFERENCES public.memos(id) ON DELETE CASCADE,
  attachment_id   uuid     REFERENCES public.memo_attachments(id) ON DELETE CASCADE,
  run_id          uuid,                                       -- groups signals by run
  layer           text NOT NULL CHECK (layer IN ('forensic','business','cross_doc','ai_visual')),
  signal_type     text NOT NULL,                              -- e.g. 'pdf_producer_changed'
  severity        text NOT NULL CHECK (severity IN ('high','medium','low','info')),
  title           text NOT NULL,
  description     text,
  evidence        jsonb DEFAULT '{}'::jsonb,                  -- raw metadata, byte ranges, hashes
  detected_at     timestamptz NOT NULL DEFAULT now(),
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_fraud_signals_memo      ON public.memo_fraud_signals(memo_id);
CREATE INDEX IF NOT EXISTS idx_fraud_signals_severity  ON public.memo_fraud_signals(memo_id, severity);
CREATE INDEX IF NOT EXISTS idx_fraud_signals_run       ON public.memo_fraud_signals(run_id);

ALTER TABLE public.memo_fraud_signals ENABLE ROW LEVEL SECURITY;

-- Anyone who can read the memo can read its signals
CREATE POLICY "fraud_signals_read"
  ON public.memo_fraud_signals
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.memos m
      WHERE m.id = memo_id
        AND (
          public.is_memo_owner(m.id, auth.uid())
          OR public.is_approver_for_memo(m.id, auth.uid())
          OR public.has_role(auth.uid(), 'admin')
        )
    )
  );

-- Only edge functions (service role) write
CREATE POLICY "fraud_signals_service_write"
  ON public.memo_fraud_signals
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');


-- 2) Run-level table --------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.memo_fraud_runs (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  memo_id              uuid NOT NULL REFERENCES public.memos(id) ON DELETE CASCADE,
  triggered_by         uuid REFERENCES auth.users(id),
  started_at           timestamptz NOT NULL DEFAULT now(),
  finished_at          timestamptz,
  status               text NOT NULL DEFAULT 'pending'
                       CHECK (status IN ('pending','running','completed','failed')),
  attachments_scanned  int NOT NULL DEFAULT 0,
  high_count           int NOT NULL DEFAULT 0,
  medium_count         int NOT NULL DEFAULT 0,
  low_count            int NOT NULL DEFAULT 0,
  overall_risk         text CHECK (overall_risk IN ('clean','low','medium','high','critical')),
  ai_summary           text,
  error_message        text,
  raw_response         jsonb
);

CREATE INDEX IF NOT EXISTS idx_fraud_runs_memo ON public.memo_fraud_runs(memo_id, started_at DESC);

ALTER TABLE public.memo_fraud_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "fraud_runs_read"
  ON public.memo_fraud_runs
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.memos m
      WHERE m.id = memo_id
        AND (
          public.is_memo_owner(m.id, auth.uid())
          OR public.is_approver_for_memo(m.id, auth.uid())
          OR public.has_role(auth.uid(), 'admin')
        )
    )
  );

CREATE POLICY "fraud_runs_service_write"
  ON public.memo_fraud_runs
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');


-- 3) Admin-tunable settings -------------------------------------------------
CREATE TABLE IF NOT EXISTS public.fraud_settings (
  id                          int PRIMARY KEY DEFAULT 1 CHECK (id = 1),  -- single-row pattern
  enabled                     boolean NOT NULL DEFAULT true,
  scan_on_submit              boolean NOT NULL DEFAULT true,
  scan_on_approval_view       boolean NOT NULL DEFAULT true,
  block_high_severity         boolean NOT NULL DEFAULT false,            -- if true, force ack-text before approve
  duplicate_lookback_days     int     NOT NULL DEFAULT 365,
  split_threshold_kwd         numeric NOT NULL DEFAULT 5000,             -- approver-authority bucket
  split_window_days           int     NOT NULL DEFAULT 14,
  vendor_new_threshold_days   int     NOT NULL DEFAULT 90,
  -- Phase 2: MFA
  mfa_required_for_payments   boolean NOT NULL DEFAULT false,
  mfa_required_for_high_risk  boolean NOT NULL DEFAULT false,
  azure_tenant_id             text,
  azure_client_id             text,
  azure_authority_url         text,
  updated_at                  timestamptz NOT NULL DEFAULT now(),
  updated_by                  uuid REFERENCES auth.users(id)
);

INSERT INTO public.fraud_settings (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

ALTER TABLE public.fraud_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "fraud_settings_read_authed"
  ON public.fraud_settings
  FOR SELECT
  USING (auth.role() = 'authenticated');

CREATE POLICY "fraud_settings_admin_write"
  ON public.fraud_settings
  FOR UPDATE
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));


-- 4) MFA columns on approval_steps -----------------------------------------
ALTER TABLE public.approval_steps
  ADD COLUMN IF NOT EXISTS mfa_verified      boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS mfa_verified_at   timestamptz,
  ADD COLUMN IF NOT EXISTS mfa_method        text,
  ADD COLUMN IF NOT EXISTS mfa_provider      text,
  ADD COLUMN IF NOT EXISTS mfa_token_jti     text,    -- jti of the id_token used; defends against replay
  ADD COLUMN IF NOT EXISTS mfa_auth_time     timestamptz;


-- 5) Azure AD identity link on profiles ------------------------------------
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS azure_ad_oid   text UNIQUE,
  ADD COLUMN IF NOT EXISTS azure_ad_upn   text;        -- user principal name; for display


-- 6) Helper view to roll up signals by run for quick UI render -------------
CREATE OR REPLACE VIEW public.v_memo_fraud_summary AS
SELECT
  s.memo_id,
  s.run_id,
  COUNT(*)                                          AS total_signals,
  COUNT(*) FILTER (WHERE s.severity = 'high')       AS high_count,
  COUNT(*) FILTER (WHERE s.severity = 'medium')     AS medium_count,
  COUNT(*) FILTER (WHERE s.severity = 'low')        AS low_count,
  MAX(s.detected_at)                                AS last_detected_at
FROM public.memo_fraud_signals s
GROUP BY s.memo_id, s.run_id;


-- 7) Audit-log columns (re-use existing audit_log for fraud-override events)
-- (No schema change needed; we just write a new event_type via the edge fn.)
