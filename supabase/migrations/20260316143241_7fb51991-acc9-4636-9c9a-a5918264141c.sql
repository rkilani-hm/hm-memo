
DROP POLICY "Users update own draft memos" ON public.memos;
CREATE POLICY "Users update own draft memos" ON public.memos
  FOR UPDATE TO authenticated
  USING (auth.uid() = from_user_id AND status = 'draft'::memo_status)
  WITH CHECK (auth.uid() = from_user_id);
