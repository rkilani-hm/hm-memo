-- Drop recursive/duplicate policies causing infinite recursion on memos

-- 1. "Reviewers read memos they have steps on" on memos table — buggy (s.memo_id = s.id)
--    and duplicates "Approvers view assigned memos" which uses safe is_approver_for_memo()
DROP POLICY IF EXISTS "Reviewers read memos they have steps on" ON public.memos;

-- 2. "Reviewers read attachments of memos they review" on memo_attachments — duplicates
--    safer "View attachments for accessible memos" policy that uses is_approver_for_memo()
DROP POLICY IF EXISTS "Reviewers read attachments of memos they review" ON public.memo_attachments;

-- 3. "Dispatcher views child reviewer steps" on approval_steps — self-referential subquery
--    on approval_steps causes recursion. Replace with SECURITY DEFINER function.
DROP POLICY IF EXISTS "Dispatcher views child reviewer steps" ON public.approval_steps;

CREATE OR REPLACE FUNCTION public.is_dispatcher_parent_of_step(_user_id uuid, _parent_step_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.approval_steps p
    WHERE p.id = _parent_step_id
      AND p.approver_user_id = _user_id
      AND p.is_dispatcher = true
  )
$$;

CREATE POLICY "Dispatcher views child reviewer steps"
ON public.approval_steps
FOR SELECT
TO authenticated
USING (
  parent_dispatch_step_id IS NOT NULL
  AND public.is_dispatcher_parent_of_step(auth.uid(), parent_dispatch_step_id)
);