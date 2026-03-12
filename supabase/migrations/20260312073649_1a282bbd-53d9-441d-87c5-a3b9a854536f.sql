CREATE POLICY "Owners delete approval steps on own draft memos"
ON public.approval_steps
FOR DELETE
TO authenticated
USING (
  is_memo_owner(auth.uid(), memo_id)
  AND (EXISTS (
    SELECT 1 FROM public.memos
    WHERE memos.id = approval_steps.memo_id
    AND memos.status IN ('draft', 'submitted', 'in_review')
  ))
);