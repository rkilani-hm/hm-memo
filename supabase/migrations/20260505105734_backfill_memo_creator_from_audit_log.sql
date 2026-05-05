-- =====================================================================
-- Backfill memos.created_by_user_id from audit_log (corrected)
-- =====================================================================
--
-- Background: a previous version of this migration backfilled
-- created_by_user_id := from_user_id, on the assumption that the
-- named author was the creator. That's WRONG for the real-world
-- pattern: most memos are drafted by an executive assistant or
-- coordinator on behalf of someone else (e.g. Retage Maarouf drafts
-- a memo where Shoma Aravindan is named as the sender). The previous
-- backfill made the named author the recorded "creator," which still
-- locks out the real creator.
--
-- Authoritative source for who actually created each memo:
-- audit_log.user_id with action IN ('memo_drafted', 'memo_submitted').
-- That row was inserted by MemoCreate at the moment of creation,
-- using the logged-in user's ID — which is by definition the person
-- who pressed Submit, regardless of who's named on the memo.
--
-- This migration:
--   1. For every memo, finds the earliest audit_log creation event
--      (memo_drafted preferred over memo_submitted; if both exist,
--      the chronologically earlier one).
--   2. Sets memos.created_by_user_id to that audit_log user_id,
--      OVERRIDING any existing value (because the previous bad
--      backfill may have set incorrect values).
--   3. Leaves rows with no creation audit event untouched. If
--      created_by_user_id is still NULL after this migration, that
--      memo predates the audit log infrastructure or was created
--      via a path that didn't audit. An admin can edit such memos
--      manually (admin role bypasses the policy) or set the
--      created_by_user_id directly via SQL once they know who.
--
-- Going forward, MemoCreate sets created_by_user_id := user.id on
-- every insert, so future memos won't need this rescue. The audit
-- log path remains as belt-and-suspenders.
-- =====================================================================

BEGIN;

-- ---------------------------------------------------------------------
-- 1. Authoritative backfill from audit_log
-- ---------------------------------------------------------------------
-- For each memo, find the earliest audit_log row representing its
-- creation. Prefer memo_drafted (always the very first event for any
-- memo, draft or submit-direct). Fall back to memo_submitted for
-- memos that were submitted directly without a draft state captured.
WITH first_creation_event AS (
  SELECT DISTINCT ON (al.memo_id)
    al.memo_id,
    al.user_id AS creator_user_id
  FROM public.audit_log al
  WHERE al.action IN ('memo_drafted', 'memo_submitted')
    AND al.user_id IS NOT NULL
    AND al.memo_id IS NOT NULL
  ORDER BY al.memo_id,
    -- Prefer memo_drafted over memo_submitted at the same timestamp
    CASE al.action WHEN 'memo_drafted' THEN 0 ELSE 1 END,
    al.created_at ASC
)
UPDATE public.memos m
   SET created_by_user_id = fce.creator_user_id
  FROM first_creation_event fce
 WHERE fce.memo_id = m.id
   AND fce.creator_user_id IS NOT NULL
   -- Overwrite even if a value is already set, since the previous
   -- migration may have populated it incorrectly. The audit log is
   -- the authoritative source.
   AND (
     m.created_by_user_id IS NULL
     OR m.created_by_user_id != fce.creator_user_id
   );

-- ---------------------------------------------------------------------
-- 2. Re-create the edit RLS policy (idempotent — drops if exists)
-- ---------------------------------------------------------------------
DROP POLICY IF EXISTS "memos_creator_admin_update" ON public.memos;

CREATE POLICY "memos_creator_admin_update" ON public.memos
  FOR UPDATE TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin')
    OR (
      from_user_id = auth.uid()
      AND status IN ('draft', 'submitted', 'in_review', 'rejected', 'rework')
    )
    OR (
      created_by_user_id = auth.uid()
      AND status IN ('draft', 'submitted', 'in_review', 'rejected', 'rework')
    )
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'admin')
    OR (
      from_user_id = auth.uid()
      AND status IN ('draft', 'submitted', 'in_review', 'rejected', 'rework')
    )
    OR (
      created_by_user_id = auth.uid()
      AND status IN ('draft', 'submitted', 'in_review', 'rejected', 'rework')
    )
  );

-- ---------------------------------------------------------------------
-- 3. Mirror policy on approval_steps (allows resubmit chain reset)
-- ---------------------------------------------------------------------
DROP POLICY IF EXISTS "approval_steps_creator_admin_delete_for_resubmit"
  ON public.approval_steps;

CREATE POLICY "approval_steps_creator_admin_delete_for_resubmit" ON public.approval_steps
  FOR DELETE TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin')
    OR EXISTS (
      SELECT 1 FROM public.memos m
      WHERE m.id = approval_steps.memo_id
        AND (m.from_user_id = auth.uid() OR m.created_by_user_id = auth.uid())
        AND m.status IN ('submitted', 'in_review', 'rejected', 'rework')
    )
  );

COMMIT;
