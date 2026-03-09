
-- Fix overly permissive policies

-- 1. Profile inserts: only the trigger (security definer) inserts, but we need to allow it
-- The handle_new_user trigger runs as SECURITY DEFINER so it bypasses RLS.
-- Remove the permissive insert policy since the trigger handles it.
DROP POLICY IF EXISTS "System inserts profiles" ON public.profiles;

-- 2. Approval steps insert: restrict to memo creator or admin
DROP POLICY IF EXISTS "System inserts approval steps" ON public.approval_steps;
CREATE POLICY "Users insert approval steps for own memos" ON public.approval_steps FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.memos WHERE id = memo_id AND from_user_id = auth.uid())
    OR public.has_role(auth.uid(), 'admin')
  );

-- 3. Audit log insert: user can only log their own actions
DROP POLICY IF EXISTS "System inserts audit" ON public.audit_log;
CREATE POLICY "Users insert own audit entries" ON public.audit_log FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- 4. Notifications insert: restrict (system creates via functions, but allow for now with user check)
DROP POLICY IF EXISTS "System inserts notifications" ON public.notifications;
CREATE POLICY "Users insert own notifications" ON public.notifications FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'));

-- 5. Memo sequences: restrict to authenticated inserts only via the function (security definer)
DROP POLICY IF EXISTS "System manages sequences" ON public.memo_sequences;
-- The get_next_transmittal_no function is SECURITY DEFINER so it bypasses RLS
-- Only admins need direct access
CREATE POLICY "Admins manage sequences" ON public.memo_sequences FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));
