DROP POLICY IF EXISTS "Users update own submitted memos" ON public.memos;

CREATE POLICY "Users update own submitted memos"
ON public.memos
FOR UPDATE
TO authenticated
USING (
  (auth.uid() = from_user_id) AND (status = ANY (ARRAY['submitted'::memo_status, 'in_review'::memo_status, 'rejected'::memo_status, 'rework'::memo_status]))
)
WITH CHECK (
  auth.uid() = from_user_id
);