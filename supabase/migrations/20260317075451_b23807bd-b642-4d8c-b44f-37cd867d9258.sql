
-- Allow admins to delete from memo_versions
CREATE POLICY "Admins delete memo versions"
ON public.memo_versions
FOR DELETE
TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role));

-- Allow admins to delete from notifications
CREATE POLICY "Admins delete notifications"
ON public.notifications
FOR DELETE
TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role));

-- Allow admins to delete from audit_log
CREATE POLICY "Admins delete audit log"
ON public.audit_log
FOR DELETE
TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role));

-- Allow admins to delete memos
CREATE POLICY "Admins delete memos"
ON public.memos
FOR DELETE
TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role));
