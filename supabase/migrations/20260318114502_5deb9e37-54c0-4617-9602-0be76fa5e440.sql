
DROP POLICY "Service insert reminders log" ON public.reminders_log;
CREATE POLICY "Admins insert reminders log" ON public.reminders_log
  FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'));
