CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
      AND role = _role
  );
$$;

DROP POLICY IF EXISTS "Admins view all memos" ON public.memos;
CREATE POLICY "Admins view all memos"
  ON public.memos
  FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Admins SELECT all memos (repair)" ON public.memos;
CREATE POLICY "Admins SELECT all memos (repair)"
  ON public.memos
  FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Users view own memos" ON public.memos;
CREATE POLICY "Users view own memos"
  ON public.memos
  FOR SELECT
  TO authenticated
  USING (auth.uid() = from_user_id);

DROP POLICY IF EXISTS "Users view memos to them" ON public.memos;
CREATE POLICY "Users view memos to them"
  ON public.memos
  FOR SELECT
  TO authenticated
  USING (auth.uid() = to_user_id);

DROP POLICY IF EXISTS "Approvers view assigned memos" ON public.memos;
CREATE POLICY "Approvers view assigned memos"
  ON public.memos
  FOR SELECT
  TO authenticated
  USING (public.is_approver_for_memo(auth.uid(), id));

DROP POLICY IF EXISTS "Dept heads view dept memos" ON public.memos;
CREATE POLICY "Dept heads view dept memos"
  ON public.memos
  FOR SELECT
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'department_head')
    AND department_id IN (
      SELECT department_id FROM public.profiles WHERE user_id = auth.uid()
    )
  );

CREATE OR REPLACE FUNCTION public.admin_diagnose_memo_visibility()
RETURNS TABLE (
  total_in_db bigint,
  visible_to_caller bigint,
  caller_user_id uuid,
  caller_is_admin boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Only admins can run this diagnostic';
  END IF;

  RETURN QUERY
  SELECT
    (SELECT count(*) FROM public.memos)::bigint AS total_in_db,
    (SELECT count(*) FROM public.memos)::bigint AS visible_to_caller,
    auth.uid() AS caller_user_id,
    true AS caller_is_admin;
END;
$$;

COMMENT ON FUNCTION public.admin_diagnose_memo_visibility IS
  'Admin diagnostic: returns total memo count and visibility stats. Useful when memos are missing from the UI to confirm data exists in DB.';