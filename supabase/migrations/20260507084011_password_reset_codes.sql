-- =====================================================================
-- password_reset_codes — OTP-based password reset
-- =====================================================================
--
-- Why this exists
-- ===============
-- The standard Supabase password reset flow uses single-use magic
-- links. In corporate Microsoft 365 environments (which Al Hamra
-- runs), the Safe Links / Defender feature pre-fetches every URL in
-- inbound mail to scan for malicious content. That pre-fetch consumes
-- the single-use OTP token. By the time the actual user clicks, the
-- link is already 'expired'.
--
-- Solution: send a 6-digit numeric code in the email instead of a
-- clickable link. Codes can't be 'consumed' by URL pre-fetching
-- because there's no URL to click — the user has to type the code
-- manually. Safe Links has nothing to scan.
--
-- The flow has three steps, backed by three edge functions:
--   1. request-password-reset       writes a row here
--   2. verify-password-reset-code   marks the row consumed,
--                                   issues a nonce
--   3. complete-password-reset      validates the nonce, sets the
--                                   new password via admin API
--
-- Schema
-- ======
-- id                — surrogate PK
-- user_id           — auth.users FK; null for "email doesn't match
--                     any user" requests (we still log them so the
--                     attacker can't tell which emails are registered)
-- email             — denormalized for query convenience and for the
--                     null-user_id rows above
-- code_hash         — SHA-256 hex of the 6-digit code. We never store
--                     the plaintext code so a database leak doesn't
--                     compromise active reset attempts
-- expires_at        — code TTL (5 minutes)
-- consumed_at       — set when the code is verified (single-use)
-- attempts          — failed verify attempts; locks after 5
-- nonce             — issued on successful verify, used to authorize
--                     the password update step
-- nonce_expires_at  — nonce TTL (10 minutes — long enough for the user
--                     to type a new password but not indefinite)
-- nonce_consumed_at — single-use nonce; once a password is set, dead
-- ip_address        — abuse tracking
-- user_agent        — abuse tracking
-- created_at        — for rate-limit windows
--
-- RLS
-- ===
-- No table-level RLS access for clients. All reads/writes go through
-- the three edge functions, which use the service role key. We still
-- ENABLE RLS to prevent any accidental client access if someone adds
-- a less-restricted policy later.
-- =====================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS public.password_reset_codes (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  email             TEXT NOT NULL,
  code_hash         TEXT NOT NULL,
  expires_at        TIMESTAMPTZ NOT NULL,
  consumed_at       TIMESTAMPTZ,
  attempts          INT NOT NULL DEFAULT 0,
  nonce             TEXT,
  nonce_expires_at  TIMESTAMPTZ,
  nonce_consumed_at TIMESTAMPTZ,
  ip_address        INET,
  user_agent        TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Rate-limit lookups: how many codes for this email in the last 15min,
-- how many for this IP in the last hour. Both queries filter by
-- email/ip and created_at descending.
CREATE INDEX IF NOT EXISTS idx_password_reset_codes_email_recent
  ON public.password_reset_codes(email, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_password_reset_codes_ip_recent
  ON public.password_reset_codes(ip_address, created_at DESC);

-- Verify-code lookup: find the latest unconsumed unexpired row for
-- this email matching this code hash.
CREATE INDEX IF NOT EXISTS idx_password_reset_codes_verify
  ON public.password_reset_codes(email, code_hash)
  WHERE consumed_at IS NULL;

-- Nonce lookup: find a row by its issued nonce for the
-- complete-password-reset step.
CREATE INDEX IF NOT EXISTS idx_password_reset_codes_nonce
  ON public.password_reset_codes(nonce)
  WHERE nonce IS NOT NULL AND nonce_consumed_at IS NULL;

-- Enable RLS, with no policies. Service-role bypasses RLS, so the
-- edge functions can still operate on the table; clients get nothing.
ALTER TABLE public.password_reset_codes ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.password_reset_codes IS
  'OTP-based password reset codes. Service-role only; no client access.';

-- Cleanup function: removes consumed and expired rows older than 7
-- days. Should be called by a scheduled job; for now we leave it
-- callable manually. Keeps table size bounded.
CREATE OR REPLACE FUNCTION public.cleanup_password_reset_codes()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DELETE FROM public.password_reset_codes
   WHERE created_at < now() - INTERVAL '7 days';
END;
$$;

COMMIT;
