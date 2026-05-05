BEGIN;

ALTER TABLE public.vendors
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS deleted_by UUID REFERENCES auth.users(id);

CREATE INDEX IF NOT EXISTS idx_vendors_live
  ON public.vendors(status)
  WHERE deleted_at IS NULL;

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

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'memos'
      AND policyname = 'memos_creator_update_draft_only'
  ) THEN
    DROP POLICY "memos_creator_update_draft_only" ON public.memos;
  END IF;

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