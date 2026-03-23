
-- Permission resources catalog
CREATE TABLE public.permission_resources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  resource_key text UNIQUE NOT NULL,
  label text NOT NULL,
  category text NOT NULL DEFAULT 'page',
  description text,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.permission_resources ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage permission_resources" ON public.permission_resources
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Authenticated read permission_resources" ON public.permission_resources
  FOR SELECT TO authenticated USING (true);

-- Department-level permissions (defaults)
CREATE TABLE public.department_permissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  department_id uuid NOT NULL REFERENCES public.departments(id) ON DELETE CASCADE,
  resource_key text NOT NULL,
  is_allowed boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(department_id, resource_key)
);

ALTER TABLE public.department_permissions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage department_permissions" ON public.department_permissions
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Authenticated read department_permissions" ON public.department_permissions
  FOR SELECT TO authenticated USING (true);

-- User-level permission overrides
CREATE TABLE public.user_permissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  resource_key text NOT NULL,
  is_allowed boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, resource_key)
);

ALTER TABLE public.user_permissions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage user_permissions" ON public.user_permissions
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Users read own permissions" ON public.user_permissions
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

-- Security definer function: check if user has access to a resource
-- Priority: user override > department default > deny (false)
CREATE OR REPLACE FUNCTION public.has_permission(_user_id uuid, _resource_key text)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _user_perm boolean;
  _dept_perm boolean;
  _dept_id uuid;
BEGIN
  -- Admin always has access
  IF public.has_role(_user_id, 'admin') THEN
    RETURN true;
  END IF;

  -- Check user-level override first
  SELECT is_allowed INTO _user_perm
  FROM public.user_permissions
  WHERE user_id = _user_id AND resource_key = _resource_key;

  IF _user_perm IS NOT NULL THEN
    RETURN _user_perm;
  END IF;

  -- Fallback: department-level
  SELECT department_id INTO _dept_id
  FROM public.profiles
  WHERE profiles.user_id = _user_id;

  IF _dept_id IS NOT NULL THEN
    SELECT is_allowed INTO _dept_perm
    FROM public.department_permissions
    WHERE department_id = _dept_id AND resource_key = _resource_key;

    IF _dept_perm IS NOT NULL THEN
      RETURN _dept_perm;
    END IF;
  END IF;

  -- Default: allowed (no restriction configured)
  RETURN true;
END;
$$;

-- Seed default page resources
INSERT INTO public.permission_resources (resource_key, label, category, description, sort_order) VALUES
  ('dashboard', 'Dashboard', 'page', 'Main dashboard with overview statistics', 1),
  ('memos', 'My Memos', 'page', 'View and manage own memos', 2),
  ('memos/create', 'Create Memo', 'page', 'Create new memos', 3),
  ('approvals', 'Pending Approvals', 'page', 'View and act on pending approvals', 4),
  ('notifications', 'Notifications', 'page', 'View all notifications', 5),
  ('settings', 'Settings', 'page', 'User profile and preferences', 6),
  ('help', 'Help Guide', 'page', 'Help documentation', 7),
  ('admin/users', 'User Management', 'page', 'Manage users (admin)', 10),
  ('admin/departments', 'Department Management', 'page', 'Manage departments (admin)', 11),
  ('admin/workflows', 'Workflow Management', 'page', 'Manage workflow templates (admin)', 12),
  ('admin/delegates', 'Delegate Management', 'page', 'Manage delegate assignments (admin)', 13),
  ('admin/audit-log', 'Audit Log', 'page', 'View audit trail (admin)', 14),
  ('admin/audit-dashboard', 'Audit Dashboard', 'page', 'Audit analytics (admin)', 15),
  ('admin/cross-dept-rules', 'Cross-Dept Rules', 'page', 'Cross-department access rules (admin)', 16),
  ('admin/approval-performance', 'Approval Performance', 'page', 'Approver KPI dashboard (admin)', 17),
  ('admin/reminder-settings', 'Reminder Settings', 'page', 'Configure daily reminders (admin)', 18),
  ('admin/authorization', 'Authorization', 'page', 'Manage page/content permissions (admin)', 19),
  ('content/memo_body', 'Memo Body Content', 'content', 'View full memo description/body text', 30),
  ('content/attachments', 'Attachments', 'content', 'View and download memo attachments', 31),
  ('content/audit_trail', 'Audit Trail Tab', 'content', 'View audit trail within memo detail', 32),
  ('content/version_history', 'Version History', 'content', 'View memo version history', 33);
