
-- Allow same-department users to update memos in submitted/in_review/rejected/rework status
CREATE POLICY "Same dept update non-approved memos"
ON public.memos
FOR UPDATE
TO authenticated
USING (
  is_same_department(auth.uid(), department_id)
  AND status IN ('submitted', 'in_review', 'rejected', 'rework')
);
