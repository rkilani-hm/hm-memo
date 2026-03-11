
-- Fix: The "Delegates view principal memos" policy queries approval_steps,
-- whose RLS policies query back to memos, causing infinite recursion.
-- Solution: Create a SECURITY DEFINER function that bypasses RLS.

CREATE OR REPLACE FUNCTION public.is_delegate_for_memo(_delegate_id uuid, _memo_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.approval_steps ast
    JOIN public.delegate_assignments da ON da.principal_user_id = ast.approver_user_id
    WHERE ast.memo_id = _memo_id
      AND da.delegate_user_id = _delegate_id
      AND da.is_active = true
  )
$$;

-- Replace the problematic policy with one using the new function
DROP POLICY IF EXISTS "Delegates view principal memos" ON public.memos;
CREATE POLICY "Delegates view principal memos" ON public.memos
FOR SELECT TO authenticated
USING (public.is_delegate_for_memo(auth.uid(), id));
