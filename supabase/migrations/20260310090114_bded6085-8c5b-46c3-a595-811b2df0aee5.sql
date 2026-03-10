
-- Fix: Make memos policies PERMISSIVE instead of RESTRICTIVE
-- Drop and recreate INSERT policy as PERMISSIVE
DROP POLICY IF EXISTS "Users create memos" ON public.memos;
CREATE POLICY "Users create memos"
  ON public.memos FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = from_user_id);

-- Also fix SELECT policies to be PERMISSIVE so users can actually see memos
DROP POLICY IF EXISTS "Users view own memos" ON public.memos;
CREATE POLICY "Users view own memos"
  ON public.memos FOR SELECT TO authenticated
  USING (auth.uid() = from_user_id);

DROP POLICY IF EXISTS "Users view memos to them" ON public.memos;
CREATE POLICY "Users view memos to them"
  ON public.memos FOR SELECT TO authenticated
  USING (auth.uid() = to_user_id);

DROP POLICY IF EXISTS "Approvers view assigned memos" ON public.memos;
CREATE POLICY "Approvers view assigned memos"
  ON public.memos FOR SELECT TO authenticated
  USING (public.is_approver_for_memo(auth.uid(), id));

DROP POLICY IF EXISTS "Admins view all memos" ON public.memos;
CREATE POLICY "Admins view all memos"
  ON public.memos FOR SELECT TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role));

DROP POLICY IF EXISTS "Admins manage memos" ON public.memos;
CREATE POLICY "Admins manage memos"
  ON public.memos FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role));

DROP POLICY IF EXISTS "Dept heads view dept memos" ON public.memos;
CREATE POLICY "Dept heads view dept memos"
  ON public.memos FOR SELECT TO authenticated
  USING (has_role(auth.uid(), 'department_head'::app_role) AND department_id IN (
    SELECT department_id FROM profiles WHERE user_id = auth.uid()
  ));

DROP POLICY IF EXISTS "Users update own draft memos" ON public.memos;
CREATE POLICY "Users update own draft memos"
  ON public.memos FOR UPDATE TO authenticated
  USING (auth.uid() = from_user_id AND status = 'draft'::memo_status);
