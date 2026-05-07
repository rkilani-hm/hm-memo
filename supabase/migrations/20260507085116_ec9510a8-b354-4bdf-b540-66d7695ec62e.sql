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

CREATE INDEX IF NOT EXISTS idx_password_reset_codes_email_recent
  ON public.password_reset_codes(email, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_password_reset_codes_ip_recent
  ON public.password_reset_codes(ip_address, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_password_reset_codes_verify
  ON public.password_reset_codes(email, code_hash)
  WHERE consumed_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_password_reset_codes_nonce
  ON public.password_reset_codes(nonce)
  WHERE nonce IS NOT NULL AND nonce_consumed_at IS NULL;

ALTER TABLE public.password_reset_codes ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.password_reset_codes IS
  'OTP-based password reset codes. Service-role only; no client access.';

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