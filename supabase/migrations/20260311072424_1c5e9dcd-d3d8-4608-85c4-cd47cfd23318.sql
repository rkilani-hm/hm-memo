-- Allow approvers to see ALL approval steps on memos they are an approver for
CREATE POLICY "Approvers view all steps for assigned memos"
ON public.approval_steps
FOR SELECT
TO authenticated
USING (
  is_approver_for_memo(auth.uid(), memo_id)
);