CREATE POLICY "Finance updates approved memos"
ON public.memos
FOR UPDATE
TO authenticated
USING (
  status = 'approved'::memo_status
  AND (
    public.has_role(auth.uid(), 'finance'::app_role)
    OR public.has_role(auth.uid(), 'finance_manager'::app_role)
    OR public.has_role(auth.uid(), 'ap_accountant'::app_role)
  )
)
WITH CHECK (
  status = 'approved'::memo_status
  AND (
    public.has_role(auth.uid(), 'finance'::app_role)
    OR public.has_role(auth.uid(), 'finance_manager'::app_role)
    OR public.has_role(auth.uid(), 'ap_accountant'::app_role)
  )
);