-- 1. fraud_settings: restrict SELECT to admins (it holds Azure AD credentials).
DROP POLICY IF EXISTS fraud_settings_read_authed ON public.fraud_settings;
CREATE POLICY fraud_settings_admin_read
  ON public.fraud_settings
  FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role));

-- 2. Storage: tighten 'attachments' bucket SELECT to users authorized for the parent memo.
DROP POLICY IF EXISTS "Authenticated view attachments" ON storage.objects;
DROP POLICY IF EXISTS "View attachments for accessible memos" ON storage.objects;
CREATE POLICY "View attachments for accessible memos"
  ON storage.objects
  FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'attachments'
    AND EXISTS (
      SELECT 1 FROM public.memos m
      WHERE m.id = ((storage.foldername(name))[1])::uuid
        AND (
          m.from_user_id = auth.uid()
          OR m.to_user_id = auth.uid()
          OR public.has_role(auth.uid(), 'admin'::app_role)
          OR public.is_approver_for_memo(auth.uid(), m.id)
          OR public.is_same_department(auth.uid(), m.department_id)
        )
    )
  );

DROP POLICY IF EXISTS "Admins manage attachment objects" ON storage.objects;
CREATE POLICY "Admins manage attachment objects"
  ON storage.objects
  FOR ALL
  TO authenticated
  USING (bucket_id = 'attachments' AND public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (bucket_id = 'attachments' AND public.has_role(auth.uid(), 'admin'::app_role));

-- 3. Storage: tighten 'vendor-attachments' bucket SELECT to staff or vendor members.
DROP POLICY IF EXISTS "Authenticated can read vendor attachments" ON storage.objects;
CREATE POLICY "Vendor attachments scoped read"
  ON storage.objects
  FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'vendor-attachments'
    AND (
      public.has_role(auth.uid(), 'admin'::app_role)
      OR public.has_role(auth.uid(), 'vendor_reviewer'::app_role)
      OR public.has_role(auth.uid(), 'vendor_master_admin'::app_role)
      OR EXISTS (
        SELECT 1 FROM public.vendor_users vu
        WHERE vu.user_id = auth.uid()
          AND vu.is_active = true
          AND vu.vendor_id::text = (storage.foldername(name))[1]
      )
    )
  );

-- 4. vendor_attachments: tighten anon INSERT to require a referenced vendor in a draftable status.
DROP POLICY IF EXISTS vendor_attachments_anon_insert ON public.vendor_attachments;
CREATE POLICY vendor_attachments_anon_insert
  ON public.vendor_attachments
  FOR INSERT
  TO anon
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.vendors v
      WHERE v.id = vendor_attachments.vendor_id
        AND v.status IN ('draft'::vendor_status, 'awaiting_vendor_response'::vendor_status)
    )
  );

-- 5. notifications: drop overly broad insert policy.
DROP POLICY IF EXISTS "Authenticated insert notifications" ON public.notifications;
-- "Users insert own notifications" remains (user_id = auth.uid() OR admin).

-- 6. vendor_audit_log: require actor_user_id = auth.uid() (or staff role).
DROP POLICY IF EXISTS vendor_audit_log_authenticated_insert ON public.vendor_audit_log;
CREATE POLICY vendor_audit_log_authenticated_insert
  ON public.vendor_audit_log
  FOR INSERT
  TO authenticated
  WITH CHECK (
    actor_user_id = auth.uid()
    OR public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'vendor_reviewer'::app_role)
    OR public.has_role(auth.uid(), 'vendor_master_admin'::app_role)
  );

-- 7. cross_department_rules: restrict reads to admins.
DROP POLICY IF EXISTS "Authenticated view cross dept rules" ON public.cross_department_rules;
-- "Admins manage cross dept rules" already provides admin SELECT via ALL.

-- 8. password_reset_codes: add explicit RESTRICTIVE deny-all client access.
DROP POLICY IF EXISTS password_reset_codes_deny_all_clients ON public.password_reset_codes;
CREATE POLICY password_reset_codes_deny_all_clients
  ON public.password_reset_codes
  AS RESTRICTIVE
  FOR ALL
  TO anon, authenticated
  USING (false)
  WITH CHECK (false);
-- Service role bypasses RLS; edge functions continue to work.