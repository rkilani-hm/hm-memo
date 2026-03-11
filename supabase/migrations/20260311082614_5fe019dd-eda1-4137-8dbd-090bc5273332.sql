
-- Fix: Replace has_cross_dept_access to not query memos table (prevents infinite recursion)
-- New version accepts department_id and memo_types directly from the policy context

CREATE OR REPLACE FUNCTION public.has_cross_dept_access(_user_id uuid, _memo_dept_id uuid, _memo_types memo_type[])
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.cross_department_rules r
    JOIN public.profiles p ON p.user_id = _user_id AND p.department_id = r.viewer_department_id
    WHERE r.is_active = true
      AND (r.source_department_ids = '{}' OR _memo_dept_id = ANY(r.source_department_ids))
      AND (r.memo_type_filter = '{}' OR _memo_types && r.memo_type_filter)
      AND (
        r.scope = 'all_users'
        OR (r.scope = 'dept_head_only' AND public.has_role(_user_id, 'department_head'))
      )
  )
$$;

-- Keep the old 2-arg version as a wrapper that also avoids recursion
-- by using plpgsql to bypass RLS explicitly
CREATE OR REPLACE FUNCTION public.has_cross_dept_access(_user_id uuid, _memo_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _dept_id uuid;
  _types memo_type[];
BEGIN
  SELECT department_id, memo_types INTO _dept_id, _types
  FROM public.memos WHERE id = _memo_id;
  IF _dept_id IS NULL THEN RETURN false; END IF;
  RETURN public.has_cross_dept_access(_user_id, _dept_id, _types);
END;
$$;

-- Drop and recreate the memos SELECT policy to use the 3-arg version (no memos join)
DROP POLICY IF EXISTS "Cross dept view memos" ON public.memos;
CREATE POLICY "Cross dept view memos" ON public.memos
FOR SELECT TO authenticated
USING (public.has_cross_dept_access(auth.uid(), department_id, memo_types));

-- Also fix approval_steps cross-dept policy if it uses the 2-arg version via memos join
DROP POLICY IF EXISTS "Cross dept view approval steps" ON public.approval_steps;
CREATE POLICY "Cross dept view approval steps" ON public.approval_steps
FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.memos m
    WHERE m.id = approval_steps.memo_id
      AND public.has_cross_dept_access(auth.uid(), m.department_id, m.memo_types)
  )
);

-- Fix audit_log cross-dept policy similarly
DROP POLICY IF EXISTS "Cross dept view audit log" ON public.audit_log;
CREATE POLICY "Cross dept view audit log" ON public.audit_log
FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.memos m
    WHERE m.id = audit_log.memo_id
      AND public.has_cross_dept_access(auth.uid(), m.department_id, m.memo_types)
  )
);
