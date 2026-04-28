-- =====================================================================
-- Permission audit trail
--
-- Captures every change to user_permissions and department_permissions
-- as an immutable event row in `permission_audit`. Triggers write the
-- row automatically on every INSERT / UPDATE / DELETE — so a history
-- exists no matter how the change was made (admin UI, direct SQL,
-- service role).
--
-- Also adds granted_by + updated_at on the existing permission tables
-- so the "current state" snapshot shows who last touched it.
-- =====================================================================

-- 1) Augment existing tables -------------------------------------------------

ALTER TABLE public.user_permissions
  ADD COLUMN IF NOT EXISTS granted_by uuid REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

ALTER TABLE public.department_permissions
  ADD COLUMN IF NOT EXISTS granted_by uuid REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();


-- 2) Audit table -----------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.permission_audit (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  occurred_at     timestamptz NOT NULL DEFAULT now(),
  scope           text NOT NULL CHECK (scope IN ('user', 'department')),
  -- Subject of the permission grant: either a user or a department
  subject_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  subject_dept_id uuid REFERENCES public.departments(id) ON DELETE SET NULL,
  -- Resource being controlled
  resource_key    text NOT NULL,
  -- Operation and value transition
  action          text NOT NULL CHECK (action IN ('granted', 'denied', 'reset_to_default', 'changed')),
  old_value       boolean,    -- null if INSERT
  new_value       boolean,    -- null if DELETE (i.e. reset to default)
  -- Actor
  changed_by      uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  -- Optional contextual snapshot (notes, ip, user agent if pushed by frontend)
  notes           text,
  context         jsonb DEFAULT '{}'::jsonb,
  -- Sanity: exactly one of subject_user_id / subject_dept_id is non-null
  CONSTRAINT permission_audit_subject_xor CHECK (
    (scope = 'user'       AND subject_user_id IS NOT NULL AND subject_dept_id IS NULL) OR
    (scope = 'department' AND subject_dept_id IS NOT NULL AND subject_user_id IS NULL)
  )
);

CREATE INDEX IF NOT EXISTS idx_perm_audit_occurred_at ON public.permission_audit (occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_perm_audit_subject_user ON public.permission_audit (subject_user_id, occurred_at DESC) WHERE subject_user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_perm_audit_subject_dept ON public.permission_audit (subject_dept_id, occurred_at DESC) WHERE subject_dept_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_perm_audit_resource     ON public.permission_audit (resource_key, occurred_at DESC);

ALTER TABLE public.permission_audit ENABLE ROW LEVEL SECURITY;

-- Read: admins can read everything; users can read their own audit rows.
CREATE POLICY "permission_audit_admin_read"
  ON public.permission_audit
  FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "permission_audit_self_read"
  ON public.permission_audit
  FOR SELECT
  TO authenticated
  USING (subject_user_id = auth.uid());

-- Write: only via triggers (service role + security-definer functions).
-- No INSERT/UPDATE/DELETE policies for authenticated users; rows are immutable.
CREATE POLICY "permission_audit_no_writes"
  ON public.permission_audit
  FOR INSERT
  TO authenticated
  WITH CHECK (false);


-- 3) Trigger functions -----------------------------------------------------

CREATE OR REPLACE FUNCTION public.tg_audit_user_permissions()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _action     text;
  _old_value  boolean;
  _new_value  boolean;
  _actor      uuid := auth.uid();
BEGIN
  IF TG_OP = 'INSERT' THEN
    _old_value := NULL;
    _new_value := NEW.is_allowed;
    _action    := CASE WHEN NEW.is_allowed THEN 'granted' ELSE 'denied' END;
    INSERT INTO public.permission_audit (
      scope, subject_user_id, resource_key, action,
      old_value, new_value, changed_by
    ) VALUES (
      'user', NEW.user_id, NEW.resource_key, _action,
      _old_value, _new_value, _actor
    );
    RETURN NEW;

  ELSIF TG_OP = 'UPDATE' THEN
    -- Only audit a meaningful change
    IF OLD.is_allowed IS DISTINCT FROM NEW.is_allowed THEN
      _old_value := OLD.is_allowed;
      _new_value := NEW.is_allowed;
      _action    := 'changed';
      INSERT INTO public.permission_audit (
        scope, subject_user_id, resource_key, action,
        old_value, new_value, changed_by
      ) VALUES (
        'user', NEW.user_id, NEW.resource_key, _action,
        _old_value, _new_value, _actor
      );
    END IF;
    -- Always bump updated_at
    NEW.updated_at := now();
    NEW.granted_by := _actor;
    RETURN NEW;

  ELSIF TG_OP = 'DELETE' THEN
    INSERT INTO public.permission_audit (
      scope, subject_user_id, resource_key, action,
      old_value, new_value, changed_by
    ) VALUES (
      'user', OLD.user_id, OLD.resource_key, 'reset_to_default',
      OLD.is_allowed, NULL, _actor
    );
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION public.tg_audit_department_permissions()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _action     text;
  _actor      uuid := auth.uid();
BEGIN
  IF TG_OP = 'INSERT' THEN
    _action := CASE WHEN NEW.is_allowed THEN 'granted' ELSE 'denied' END;
    INSERT INTO public.permission_audit (
      scope, subject_dept_id, resource_key, action,
      old_value, new_value, changed_by
    ) VALUES (
      'department', NEW.department_id, NEW.resource_key, _action,
      NULL, NEW.is_allowed, _actor
    );
    RETURN NEW;

  ELSIF TG_OP = 'UPDATE' THEN
    IF OLD.is_allowed IS DISTINCT FROM NEW.is_allowed THEN
      INSERT INTO public.permission_audit (
        scope, subject_dept_id, resource_key, action,
        old_value, new_value, changed_by
      ) VALUES (
        'department', NEW.department_id, NEW.resource_key, 'changed',
        OLD.is_allowed, NEW.is_allowed, _actor
      );
    END IF;
    NEW.updated_at := now();
    NEW.granted_by := _actor;
    RETURN NEW;

  ELSIF TG_OP = 'DELETE' THEN
    INSERT INTO public.permission_audit (
      scope, subject_dept_id, resource_key, action,
      old_value, new_value, changed_by
    ) VALUES (
      'department', OLD.department_id, OLD.resource_key, 'reset_to_default',
      OLD.is_allowed, NULL, _actor
    );
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$;


-- 4) Wire triggers ---------------------------------------------------------

DROP TRIGGER IF EXISTS audit_user_permissions ON public.user_permissions;
CREATE TRIGGER audit_user_permissions
  BEFORE INSERT OR UPDATE OR DELETE ON public.user_permissions
  FOR EACH ROW EXECUTE FUNCTION public.tg_audit_user_permissions();

DROP TRIGGER IF EXISTS audit_department_permissions ON public.department_permissions;
CREATE TRIGGER audit_department_permissions
  BEFORE INSERT OR UPDATE OR DELETE ON public.department_permissions
  FOR EACH ROW EXECUTE FUNCTION public.tg_audit_department_permissions();


-- 5) Add new resource_key for the audit page itself ------------------------

INSERT INTO public.permission_resources (resource_key, label, category, description, sort_order)
VALUES
  ('admin/permission-audit', 'Permission Audit', 'page',
   'Trail of every permission grant, denial, and reset across users and departments (admin)', 21)
ON CONFLICT (resource_key) DO NOTHING;
