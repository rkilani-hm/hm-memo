
-- Security definer function to check if user is approver for a memo (avoids RLS recursion)
CREATE OR REPLACE FUNCTION public.is_approver_for_memo(_user_id uuid, _memo_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.approval_steps
    WHERE approver_user_id = _user_id AND memo_id = _memo_id
  )
$$;

-- Security definer function to check if user owns a memo (avoids RLS recursion)
CREATE OR REPLACE FUNCTION public.is_memo_owner(_user_id uuid, _memo_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.memos
    WHERE from_user_id = _user_id AND id = _memo_id
  )
$$;

-- Fix memos: replace "Approvers view assigned memos" to not query approval_steps via RLS
DROP POLICY IF EXISTS "Approvers view assigned memos" ON public.memos;
CREATE POLICY "Approvers view assigned memos"
  ON public.memos FOR SELECT TO authenticated
  USING (public.is_approver_for_memo(auth.uid(), id));

-- Fix approval_steps: replace policies that query memos
DROP POLICY IF EXISTS "View steps for own memos" ON public.approval_steps;
CREATE POLICY "View steps for own memos"
  ON public.approval_steps FOR SELECT TO authenticated
  USING (public.is_memo_owner(auth.uid(), memo_id));

DROP POLICY IF EXISTS "Users insert approval steps for own memos" ON public.approval_steps;
CREATE POLICY "Users insert approval steps for own memos"
  ON public.approval_steps FOR INSERT TO authenticated
  WITH CHECK (public.is_memo_owner(auth.uid(), memo_id) OR has_role(auth.uid(), 'admin'::app_role));

-- Fix memo_attachments: replace policy that queries memos with approval_steps subquery
DROP POLICY IF EXISTS "View attachments for accessible memos" ON public.memo_attachments;
CREATE POLICY "View attachments for accessible memos"
  ON public.memo_attachments FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.memos
      WHERE memos.id = memo_attachments.memo_id
        AND (memos.from_user_id = auth.uid() OR memos.to_user_id = auth.uid())
    )
    OR public.is_approver_for_memo(auth.uid(), memo_id)
    OR has_role(auth.uid(), 'admin'::app_role)
  );
