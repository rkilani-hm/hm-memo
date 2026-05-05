-- =====================================================================
-- Backfill memos.created_by_user_id + verify edit RLS
-- =====================================================================
--
-- Real-world bug: a memo creator (Retage Maarouf) clicked Edit &
-- Resubmit on a memo she created and got "Cannot Edit". Diagnosis:
-- the memo was created BEFORE the created_by_user_id column existed
-- (migration 20260429090310 added the column nullable for backwards
-- compatibility), so on her memo:
--   from_user_id        = (some other named author, possibly the named
--                          sender like the HR Manager)
--   created_by_user_id  = NULL  ← this is the bug
-- Both the MemoView visibility check and the MemoEdit isEditable
-- predicate evaluated to false, so she was blocked.
--
-- Fix:
--   1. Backfill created_by_user_id := from_user_id for any rows where
--      created_by_user_id IS NULL. Safe default: if no separate creator
--      was recorded, treat the named author as the creator. Worst case
--      this is too permissive (the named author can edit a memo someone
--      else actually drafted on their behalf), which is a much milder
--      problem than "the actual creator can't edit at all."
--
--   2. Re-verify the memos_creator_admin_update policy includes the
--      created_by_user_id branch (it already does from
--      20260505075023, but we re-create it idempotently to be sure).
--
-- Going forward MemoCreate sets created_by_user_id := user.id on
-- every insert, so future memos won't have NULLs.
-- =====================================================================

BEGIN;

-- 1. Backfill -----------------------------------------------------------
UPDATE public.memos
   SET created_by_user_id = from_user_id
 WHERE created_by_user_id IS NULL
   AND from_user_id IS NOT NULL;

-- Optional safety: if any rows still have NULL created_by_user_id (no
-- from_user_id either, which would be unusual), don't try to fix them
-- automatically — log via comment instead. The policy below uses
-- equality checks that simply won't match a NULL anyway, so these
-- rows remain edit-locked unless an admin handles them.

-- 2. Re-verify edit policy ---------------------------------------------
-- Drop and recreate to ensure the latest definition is in place. This
-- is idempotent — drops if the policy exists, creates fresh.
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

-- 3. Mirror policy on approval_steps so the resubmit chain-reset works
-- (deletes previous approval steps before recreating). Also idempotent.
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
