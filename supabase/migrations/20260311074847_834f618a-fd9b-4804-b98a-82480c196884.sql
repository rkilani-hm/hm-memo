CREATE POLICY "Recipients view all steps for their memos"
ON public.approval_steps
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.memos
    WHERE memos.id = approval_steps.memo_id
      AND memos.to_user_id = auth.uid()
  )
);