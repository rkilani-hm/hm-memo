-- =====================================================================
-- Add created_by_user_id + relax memos INSERT policy
--
-- Problem
-- =======
-- After commit c9a2154 fixed the bug where from_user_id was hardcoded
-- to the logged-in user (instead of using the form's "From" dropdown),
-- a NEW bug surfaced: the existing INSERT policy on memos requires
-- auth.uid() = from_user_id. So when Monia creates a memo on behalf
-- of Rami, the resulting row has from_user_id = Rami but auth.uid()
-- is Monia — INSERT rejected with "new row violates row-level
-- security policy."
--
-- Architecturally, "from_user_id" (whose name and signature go on the
-- memo body) and "created_by_user_id" (who physically pressed Submit)
-- are two different concepts that the prior code was conflating.
-- This migration fixes that.
--
-- Solution
-- ========
--   1. Add memos.created_by_user_id (nullable for backwards compat).
--   2. Replace the INSERT policy: auth.uid() must match EITHER
--      from_user_id OR created_by_user_id.
--      - Self-authored memo: both fields = auth.uid(), passes.
--      - On-behalf-of: from_user_id = principal, created_by_user_id =
--        actual creator (auth.uid()), passes.
--      - Falsified row: neither field = auth.uid(), rejected.
--
-- Backwards compatibility
-- =======================
-- Existing memo rows have created_by_user_id = NULL. They continue
-- to be readable via existing SELECT policies. They simply don't have
-- the new audit info. Going forward, the frontend populates the
-- column on every new memo.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1) Add the new column
-- ---------------------------------------------------------------------
ALTER TABLE public.memos
  ADD COLUMN IF NOT EXISTS created_by_user_id uuid REFERENCES auth.users(id);

COMMENT ON COLUMN public.memos.created_by_user_id IS
  'The user who physically pressed Submit when this memo was created. May differ from from_user_id when one user creates a memo on behalf of another (e.g. an assistant creating a memo for a manager). Nullable for backwards compatibility with rows created before this column existed.';

CREATE INDEX IF NOT EXISTS idx_memos_created_by_user_id
  ON public.memos (created_by_user_id)
  WHERE created_by_user_id IS NOT NULL;


-- ---------------------------------------------------------------------
-- 2) Replace the INSERT policy
-- ---------------------------------------------------------------------
-- Drop both possible older versions of the policy (the same name was
-- defined in two migrations historically — see 20260309081106 and
-- 20260310090114). DROP IF EXISTS is idempotent.
DROP POLICY IF EXISTS "Users create memos" ON public.memos;

CREATE POLICY "Users create memos"
  ON public.memos
  FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.uid() = from_user_id
    OR auth.uid() = created_by_user_id
  );

COMMENT ON POLICY "Users create memos" ON public.memos IS
  'Permits creating a memo if auth.uid() is either the from_user (self-authored) or the created_by_user (creating on behalf of). Prevents falsifying memos: at least one of the two user-identifying fields must match the actual logged-in user.';
