
-- Tighten the notifications insert policy: only allow inserting for self or if user is an approver
DROP POLICY IF EXISTS "Approvers insert notifications" ON public.notifications;
CREATE POLICY "Authenticated insert notifications" ON public.notifications
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id OR EXISTS (SELECT 1 FROM approval_steps WHERE approver_user_id = auth.uid()));
