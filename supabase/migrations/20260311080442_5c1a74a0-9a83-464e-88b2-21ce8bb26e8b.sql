
-- 1. Create cross_department_rules table
CREATE TABLE public.cross_department_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  viewer_department_id uuid NOT NULL REFERENCES public.departments(id) ON DELETE CASCADE,
  source_department_ids uuid[] NOT NULL DEFAULT '{}',
  memo_type_filter public.memo_type[] NOT NULL DEFAULT '{}',
  access_level text NOT NULL DEFAULT 'view_only',
  scope text NOT NULL DEFAULT 'all_users',
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.cross_department_rules ENABLE ROW LEVEL SECURITY;

-- 2. Create memo_versions table
CREATE TABLE public.memo_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  memo_id uuid NOT NULL REFERENCES public.memos(id) ON DELETE CASCADE,
  version_number integer NOT NULL,
  changed_by_user_id uuid NOT NULL,
  changes jsonb NOT NULL DEFAULT '{}',
  previous_values jsonb NOT NULL DEFAULT '{}',
  ip_address text,
  user_agent text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(memo_id, version_number)
);

ALTER TABLE public.memo_versions ENABLE ROW LEVEL SECURITY;

-- 3. Security definer functions
CREATE OR REPLACE FUNCTION public.is_same_department(_user_id uuid, _dept_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE user_id = _user_id AND department_id = _dept_id
  )
$$;

CREATE OR REPLACE FUNCTION public.has_cross_dept_access(_user_id uuid, _memo_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.cross_department_rules r
    JOIN public.profiles p ON p.user_id = _user_id AND p.department_id = r.viewer_department_id
    JOIN public.memos m ON m.id = _memo_id
    WHERE r.is_active = true
      AND (r.source_department_ids = '{}' OR m.department_id = ANY(r.source_department_ids))
      AND (r.memo_type_filter = '{}' OR m.memo_types && r.memo_type_filter)
      AND (
        r.scope = 'all_users'
        OR (r.scope = 'dept_head_only' AND public.has_role(_user_id, 'department_head'))
      )
  )
$$;

-- 4. RLS on cross_department_rules
CREATE POLICY "Admins manage cross dept rules"
ON public.cross_department_rules FOR ALL TO authenticated
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Authenticated view cross dept rules"
ON public.cross_department_rules FOR SELECT TO authenticated
USING (true);

-- 5. RLS on memo_versions
CREATE POLICY "View versions for accessible memos"
ON public.memo_versions FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.memos m
    WHERE m.id = memo_versions.memo_id
      AND (
        m.from_user_id = auth.uid()
        OR m.to_user_id = auth.uid()
        OR public.is_same_department(auth.uid(), m.department_id)
        OR public.is_approver_for_memo(auth.uid(), m.id)
        OR public.has_cross_dept_access(auth.uid(), m.id)
        OR public.has_role(auth.uid(), 'admin')
      )
  )
);

CREATE POLICY "Insert versions for dept memos"
ON public.memo_versions FOR INSERT TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.memos m
    WHERE m.id = memo_versions.memo_id
      AND (m.from_user_id = auth.uid() OR public.is_same_department(auth.uid(), m.department_id))
  )
);

-- 6. Same-department RLS on memos
CREATE POLICY "Same dept view all memos"
ON public.memos FOR SELECT TO authenticated
USING (public.is_same_department(auth.uid(), department_id));

CREATE POLICY "Same dept update draft memos"
ON public.memos FOR UPDATE TO authenticated
USING (public.is_same_department(auth.uid(), department_id) AND status = 'draft');

-- 7. Cross-department RLS on memos
CREATE POLICY "Cross dept view memos"
ON public.memos FOR SELECT TO authenticated
USING (public.has_cross_dept_access(auth.uid(), id));

-- 8. Same-department RLS on approval_steps
CREATE POLICY "Same dept view approval steps"
ON public.approval_steps FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.memos m
    WHERE m.id = approval_steps.memo_id
      AND public.is_same_department(auth.uid(), m.department_id)
  )
);

-- 9. Cross-department RLS on approval_steps
CREATE POLICY "Cross dept view approval steps"
ON public.approval_steps FOR SELECT TO authenticated
USING (public.has_cross_dept_access(auth.uid(), memo_id));

-- 10. Same-department RLS on memo_attachments
CREATE POLICY "Same dept view attachments"
ON public.memo_attachments FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.memos m
    WHERE m.id = memo_attachments.memo_id
      AND public.is_same_department(auth.uid(), m.department_id)
  )
);

CREATE POLICY "Same dept manage draft attachments"
ON public.memo_attachments FOR INSERT TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.memos m
    WHERE m.id = memo_attachments.memo_id
      AND public.is_same_department(auth.uid(), m.department_id)
      AND m.status = 'draft'
  )
);

CREATE POLICY "Same dept delete draft attachments"
ON public.memo_attachments FOR DELETE TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.memos m
    WHERE m.id = memo_attachments.memo_id
      AND public.is_same_department(auth.uid(), m.department_id)
      AND m.status = 'draft'
  )
);

-- 11. Same-department RLS on audit_log
CREATE POLICY "Same dept view audit log"
ON public.audit_log FOR SELECT TO authenticated
USING (
  memo_id IS NOT NULL AND
  EXISTS (
    SELECT 1 FROM public.memos m
    WHERE m.id = audit_log.memo_id
      AND public.is_same_department(auth.uid(), m.department_id)
  )
);

-- 12. Cross-department RLS on audit_log (view_audit only)
CREATE POLICY "Cross dept view audit log"
ON public.audit_log FOR SELECT TO authenticated
USING (
  memo_id IS NOT NULL AND
  EXISTS (
    SELECT 1
    FROM public.cross_department_rules r
    JOIN public.profiles p ON p.user_id = auth.uid() AND p.department_id = r.viewer_department_id
    JOIN public.memos m ON m.id = audit_log.memo_id
    WHERE r.is_active = true
      AND r.access_level = 'view_audit'
      AND (r.source_department_ids = '{}' OR m.department_id = ANY(r.source_department_ids))
      AND (r.memo_type_filter = '{}' OR m.memo_types && r.memo_type_filter)
      AND (
        r.scope = 'all_users'
        OR (r.scope = 'dept_head_only' AND public.has_role(auth.uid(), 'department_head'))
      )
  )
);

-- 13. Updated_at trigger for cross_department_rules
CREATE TRIGGER update_cross_department_rules_updated_at
  BEFORE UPDATE ON public.cross_department_rules
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 14. Seed 4 default cross-department rules
INSERT INTO public.cross_department_rules (name, viewer_department_id, source_department_ids, memo_type_filter, access_level, scope) VALUES
  ('Finance sees all Payment memos', 'd1000000-0000-0000-0000-000000000002', '{}', '{payments}', 'view_audit', 'all_users'),
  ('GM sees all memos', 'd1000000-0000-0000-0000-000000000007', '{}', '{}', 'view_audit', 'all_users'),
  ('Legal Head sees Action & Request memos', 'd1000000-0000-0000-0000-000000000005', '{}', '{action,request}', 'view_only', 'dept_head_only'),
  ('HR sees all Announcement memos', 'd1000000-0000-0000-0000-000000000006', '{}', '{announcement}', 'view_only', 'all_users');

-- 15. Enable realtime on memo_versions
ALTER PUBLICATION supabase_realtime ADD TABLE public.memo_versions;
