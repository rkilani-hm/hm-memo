-- =====================================================================
-- Vendor soft-delete + Memo edit-and-resubmit foundation
-- =====================================================================
--
-- Two related but independent additions:
--
-- 1. vendors.deleted_at
--    Adds soft-delete to the vendor master. Hard delete is dangerous
--    because the vendor_audit_log + vendor_sap_events references would
--    cascade away, breaking forensic traceability if anyone ever asks
--    "why did we have a record for this vendor in 2024." Soft delete
--    preserves the row, hides it from default queries, and lets admins
--    restore it.
--
--    RLS: only admins see soft-deleted vendors. vendor_reviewer and
--    vendor_master_admin only see live vendors (deleted_at IS NULL).
--    Vendor portal users obviously can't see deleted records either —
--    when an admin soft-deletes, a separate code path also flips
--    vendor_users.is_active = false so the portal user is locked out.
--
-- 2. memo_edit_log table + relaxed memo edit RLS
--    The existing audit_log already captures field-level diffs when a
--    memo is edited (via MemoEdit.tsx writing 'memo_submitted' rows
--    with changed_fields in details). For the edit-and-resubmit
--    feature, we keep using audit_log and DO NOT add a separate
--    memo_edit_log table — the existing infrastructure is correct and
--    well-integrated.
--
--    What does change: the RLS policy on memos previously implicitly
--    blocked updates by non-admin creators on memos in 'submitted' or
--    'in_review' status. We need to allow creators (and admins) to
--    edit memos in those flow-states. The page-level + edge-function
--    logic already handles the chain reset correctly; this just
--    unblocks the database write.
-- =====================================================================

BEGIN;

-- ---------------------------------------------------------------------
-- 1. VENDOR SOFT-DELETE
-- ---------------------------------------------------------------------

ALTER TABLE public.vendors
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS deleted_by UUID REFERENCES auth.users(id);

-- Index speeds up the common 'live vendors' query
CREATE INDEX IF NOT EXISTS idx_vendors_live
  ON public.vendors(status)
  WHERE deleted_at IS NULL;

-- Update RLS: non-admins only see live vendors. Admins see everything.
DROP POLICY IF EXISTS "vendors_staff_read" ON public.vendors;
CREATE POLICY "vendors_staff_read" ON public.vendors
  FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin')
    OR (
      deleted_at IS NULL
      AND (
        public.has_role(auth.uid(), 'vendor_reviewer')
        OR public.has_role(auth.uid(), 'vendor_master_admin')
        OR public.has_role(auth.uid(), 'finance')
        OR public.has_role(auth.uid(), 'finance_manager')
      )
    )
  );

DROP POLICY IF EXISTS "vendors_vendor_user_read" ON public.vendors;
CREATE POLICY "vendors_vendor_user_read" ON public.vendors
  FOR SELECT TO authenticated
  USING (
    deleted_at IS NULL
    AND EXISTS (
      SELECT 1 FROM public.vendor_users vu
      WHERE vu.vendor_id = vendors.id
        AND vu.user_id = auth.uid()
        AND vu.is_active = true
    )
  );

-- Write policy already handles UPDATE/DELETE by admins; no change needed.

-- ---------------------------------------------------------------------
-- 2. MEMO EDIT-AND-RESUBMIT — RLS RELAXATION
-- ---------------------------------------------------------------------
-- The existing memo update policy needs to permit creators to update
-- their own memos while in 'submitted', 'in_review', 'rejected', or
-- 'rework' statuses. Admins can already update any memo in any status.
--
-- We'd add a new policy here, but inspecting the codebase confirms the
-- application currently does these updates via the supabase client
-- using the user's session token, so RLS evaluates against the user's
-- auth.uid(). The existing policy "memos_creator_update" (if present)
-- would be replaced or amended.
--
-- Specific check: this migration is idempotent — IF the policy already
-- allows what we need (i.e., creator can update their own memos
-- regardless of status), it does nothing.

DO $$
BEGIN
  -- Drop any too-restrictive existing policy that blocks creators
  -- from updating their own non-draft memos.
  IF EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'memos'
      AND policyname = 'memos_creator_update_draft_only'
  ) THEN
    DROP POLICY "memos_creator_update_draft_only" ON public.memos;
  END IF;

  -- Add a permissive creator-update policy. Creators can update their
  -- own memos in any non-final status. Admins can update anything.
  -- The application layer enforces which fields are editable + the
  -- chain reset; this policy just unblocks the write at the DB level.
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'memos'
      AND policyname = 'memos_creator_admin_update'
  ) THEN
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
  END IF;

  -- Mirror policy on approval_steps so the resubmit flow can delete
  -- the existing steps before recreating them. Already permitted for
  -- admins via service role; this allows the user-session path.
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'approval_steps'
      AND policyname = 'approval_steps_creator_admin_delete_for_resubmit'
  ) THEN
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
  END IF;
END $$;

COMMIT;
