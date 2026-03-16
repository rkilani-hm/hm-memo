
-- Allow memo owners to update their own memos when status is submitted or in_review (for editing after submission)
CREATE POLICY "Users update own submitted memos"
ON public.memos
FOR UPDATE
TO authenticated
USING (auth.uid() = from_user_id AND status IN ('submitted'::memo_status, 'in_review'::memo_status))
WITH CHECK (auth.uid() = from_user_id);
