ALTER TABLE public.memos
  ADD COLUMN IF NOT EXISTS created_by_user_id uuid REFERENCES auth.users(id);

COMMENT ON COLUMN public.memos.created_by_user_id IS
  'The user who physically pressed Submit when this memo was created. May differ from from_user_id when one user creates a memo on behalf of another.';

CREATE INDEX IF NOT EXISTS idx_memos_created_by_user_id
  ON public.memos (created_by_user_id)
  WHERE created_by_user_id IS NOT NULL;

DROP POLICY IF EXISTS "Users create memos" ON public.memos;

CREATE POLICY "Users create memos"
  ON public.memos
  FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.uid() = from_user_id
    OR auth.uid() = created_by_user_id
  );

COMMENT ON POLICY "Users create memos" ON public.memos IS
  'Permits creating a memo if auth.uid() is either the from_user (self-authored) or the created_by_user (creating on behalf of). At least one must match the actual logged-in user.';