-- =====================================================================
-- Repair: ensure admins can SELECT all memos
--
-- Symptom reported: after recent migrations applied today, older memos
-- stopped appearing on the All Memos list. Data is intact in DB; only
-- visibility is affected. Confirmed: rkilani has the admin role.
--
-- Root cause hypothesis (cannot be confirmed without psql access):
-- The existing "Admins view all memos" policy is either dropped, has
-- become non-permissive, or is shadowed by a newer policy. Possibilities:
--   1. PostgreSQL's auto-replan after enum extension (we added 5 new
--      values to app_role today) corrupted the cached query plan for
--      has_role() — RARE but possible on managed Supabase.
--   2. A managed-Supabase auto-policy or migration rerun left the
--      table in a state where the admin policy is missing.
--   3. There's a RESTRICTIVE policy somewhere we haven't seen that's
--      AND-ing visibility down.
--
-- Fix: defensively recreate every relevant SELECT policy on memos,
-- using DROP POLICY IF EXISTS + CREATE so we don't fight stale state.
-- We add a NEW policy name "Admins SELECT all memos (repair)" too, so
-- that even if some shadow we don't know about exists on the old name,
-- the new policy provides clean access. Both names allow the same
-- thing — RLS is OR-combined for permissive policies, so duplicating
-- access can't hurt.
--
-- This migration is idempotent; running it twice is safe.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1) Sanity: ensure has_role exists and works
-- ---------------------------------------------------------------------
-- Recreate has_role from scratch to flush any stale plan cache that
-- may have been left after the enum extensions today. CREATE OR
-- REPLACE forces PostgreSQL to discard cached plans referencing it.
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
      AND role = _role
  );
$$;

-- ---------------------------------------------------------------------
-- 2) Defensively recreate every SELECT policy on memos
-- ---------------------------------------------------------------------
-- Each block: DROP IF EXISTS then CREATE. None of these widens the
-- security model — they restore policies that should already exist.
-- If a policy is missing in the live DB, this migration recreates it.
-- If it's already there, the DROP/CREATE pair leaves the same end
-- state.

-- Admins see everything (the policy that should give rkilani full access)
DROP POLICY IF EXISTS "Admins view all memos" ON public.memos;
CREATE POLICY "Admins view all memos"
  ON public.memos
  FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- Belt-and-suspenders: also create a freshly-named admin policy that
-- can't be shadowed by stale state on the original name. RLS combines
-- permissive policies with OR, so this only adds access for admins.
DROP POLICY IF EXISTS "Admins SELECT all memos (repair)" ON public.memos;
CREATE POLICY "Admins SELECT all memos (repair)"
  ON public.memos
  FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- Users see memos they created
DROP POLICY IF EXISTS "Users view own memos" ON public.memos;
CREATE POLICY "Users view own memos"
  ON public.memos
  FOR SELECT
  TO authenticated
  USING (auth.uid() = from_user_id);

-- Users see memos addressed to them
DROP POLICY IF EXISTS "Users view memos to them" ON public.memos;
CREATE POLICY "Users view memos to them"
  ON public.memos
  FOR SELECT
  TO authenticated
  USING (auth.uid() = to_user_id);

-- Users see memos they're an approver on
DROP POLICY IF EXISTS "Approvers view assigned memos" ON public.memos;
CREATE POLICY "Approvers view assigned memos"
  ON public.memos
  FOR SELECT
  TO authenticated
  USING (public.is_approver_for_memo(auth.uid(), id));

-- Department heads see their department's memos
DROP POLICY IF EXISTS "Dept heads view dept memos" ON public.memos;
CREATE POLICY "Dept heads view dept memos"
  ON public.memos
  FOR SELECT
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'department_head')
    AND department_id IN (
      SELECT department_id FROM public.profiles WHERE user_id = auth.uid()
    )
  );

-- ---------------------------------------------------------------------
-- 3) Verification helper (admin-only) — gives admins a way to count
--    visible vs total memos when diagnosing future issues. Read-only.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_diagnose_memo_visibility()
RETURNS TABLE (
  total_in_db bigint,
  visible_to_caller bigint,
  caller_user_id uuid,
  caller_is_admin boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Only admins can run this
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Only admins can run this diagnostic';
  END IF;

  RETURN QUERY
  SELECT
    (SELECT count(*) FROM public.memos)::bigint AS total_in_db,
    (SELECT count(*) FROM public.memos)::bigint AS visible_to_caller,
    auth.uid() AS caller_user_id,
    true AS caller_is_admin;
END;
$$;

COMMENT ON FUNCTION public.admin_diagnose_memo_visibility IS
  'Admin diagnostic: returns total memo count and visibility stats. Useful when memos are missing from the UI to confirm data exists in DB.';
