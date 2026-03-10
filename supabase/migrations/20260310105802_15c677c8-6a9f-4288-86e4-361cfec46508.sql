
-- Fix: Add WITH CHECK to allow status change during approval
DROP POLICY IF EXISTS "Approvers update own steps" ON public.approval_steps;
CREATE POLICY "Approvers update own steps" ON public.approval_steps
  FOR UPDATE TO authenticated
  USING (auth.uid() = approver_user_id AND status = 'pending')
  WITH CHECK (auth.uid() = approver_user_id);
