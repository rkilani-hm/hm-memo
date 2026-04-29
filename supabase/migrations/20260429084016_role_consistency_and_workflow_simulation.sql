-- =====================================================================
-- Hardening: role consistency + workflow simulation
--
-- Three improvements landing together:
--
--   1. Enforce at most one user with the finance_dispatcher role.
--      Prior bug (memos 0046/0047) traced back to Rami having the
--      role assigned by mistake, causing submit-memo's rewrite logic
--      to drop him from chains. The code fix in 86f9591 prevents the
--      drop, but adding a hard DB constraint stops the accidental
--      assignment in the first place.
--
--   2. simulate_workflow_chain() RPC — admins can preview what
--      approval chain a memo using a given template would generate,
--      using the same role-detection + delegation logic as
--      submit-memo. Useful for catching misconfigurations before a
--      memo is submitted.
--
--   3. Permission resource for the new admin page.
-- =====================================================================


-- ---------------------------------------------------------------------
-- 1) Partial unique index — only one row with role='finance_dispatcher'
-- ---------------------------------------------------------------------
-- Postgres lets us express 'at most one row matching a condition'
-- with a partial unique index. We index a constant (true) for any
-- row where role='finance_dispatcher'. Two such rows would collide.
--
-- Why partial instead of a CHECK constraint or trigger:
--   - Constraint has to evaluate at row insert time and can't see
--     other rows in the same table cleanly.
--   - Trigger can do it but is more code to maintain.
--   - Partial unique index is one-line, deterministic, and uses
--     Postgres's native uniqueness machinery.
--
-- We DROP IF EXISTS first so re-running this migration is safe.
-- We also explicitly check for existing duplicates before creating
-- the index — if duplicates exist, the index creation will fail
-- and we want a clear error message.

DO $$
DECLARE
  _dispatcher_count integer;
  _user_list text;
BEGIN
  SELECT count(*) INTO _dispatcher_count
  FROM public.user_roles
  WHERE role = 'finance_dispatcher';

  IF _dispatcher_count > 1 THEN
    SELECT string_agg(p.email, ', ') INTO _user_list
    FROM public.user_roles ur
    JOIN public.profiles p ON p.user_id = ur.user_id
    WHERE ur.role = 'finance_dispatcher';

    RAISE EXCEPTION
      'Cannot apply uniqueness constraint: % users currently hold the finance_dispatcher role (%). Remove all but one before applying this migration.',
      _dispatcher_count, _user_list;
  END IF;
END $$;

DROP INDEX IF EXISTS public.uq_one_finance_dispatcher;
CREATE UNIQUE INDEX uq_one_finance_dispatcher
  ON public.user_roles ((1))
  WHERE role = 'finance_dispatcher';

COMMENT ON INDEX public.uq_one_finance_dispatcher IS
  'Enforces at most one user holds the finance_dispatcher role at any time. Coverage for absence is provided by delegate_assignments(scope=''finance_dispatcher''), not by assigning the role to a second user.';


-- ---------------------------------------------------------------------
-- 2) simulate_workflow_chain() — read-only chain preview RPC
-- ---------------------------------------------------------------------
-- Returns the rows that submit-memo WOULD insert into approval_steps
-- if a memo were submitted right now using the given template. Mirrors
-- submit-memo's logic exactly:
--
--   1. Read the template's steps JSON.
--   2. For each step, check if the approver holds finance_dispatcher.
--   3. If yes, look up an active delegation for THAT user.
--   4. Resolve the final approver_user_id (delegate or original).
--
-- This function is READ-ONLY — it does not insert anything, so admins
-- can call it freely to preview different scenarios.
--
-- SECURITY: SECURITY DEFINER + admin-only check. Read-only by design,
-- but we still guard it because the result reveals the role+delegation
-- structure of finance team members.

CREATE OR REPLACE FUNCTION public.simulate_workflow_chain(
  p_template_id uuid
)
RETURNS TABLE (
  step_order      integer,
  template_approver_id uuid,
  template_approver_name text,
  effective_approver_id uuid,
  effective_approver_name text,
  is_dispatcher   boolean,
  was_rewritten   boolean,
  rewrite_reason  text,
  action_type     text,
  label           text,
  warnings        text[]
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _is_admin boolean;
  _now timestamptz := now();
BEGIN
  -- Admin gate
  SELECT public.has_role(auth.uid(), 'admin') INTO _is_admin;
  IF NOT _is_admin THEN
    RAISE EXCEPTION 'Only admins can simulate workflow chains';
  END IF;

  RETURN QUERY
  WITH template_steps AS (
    SELECT
      (row_number() OVER ())::integer AS step_idx,
      (s_elem ->> 'approver_user_id')::uuid AS approver_id,
      COALESCE(s_elem ->> 'action_type', 'signature') AS action_type,
      COALESCE(s_elem ->> 'label', '') AS label
    FROM public.workflow_templates wt,
         jsonb_array_elements(wt.steps::jsonb) AS s_elem
    WHERE wt.id = p_template_id
  ),
  with_dispatcher_flag AS (
    SELECT
      ts.*,
      EXISTS (
        SELECT 1 FROM public.user_roles ur
        WHERE ur.user_id = ts.approver_id
          AND ur.role = 'finance_dispatcher'
      ) AS approver_is_dispatcher
    FROM template_steps ts
  ),
  with_delegation AS (
    SELECT
      wdf.*,
      (
        SELECT da.delegate_user_id
        FROM public.delegate_assignments da
        WHERE da.principal_user_id = wdf.approver_id
          AND da.scope = 'finance_dispatcher'
          AND da.is_active = true
          AND da.revoked_at IS NULL
          AND (da.valid_from IS NULL OR da.valid_from <= _now)
          AND (da.valid_to   IS NULL OR da.valid_to   >= _now)
        ORDER BY da.created_at DESC
        LIMIT 1
      ) AS active_delegate_id
    FROM with_dispatcher_flag wdf
    WHERE wdf.approver_is_dispatcher = true

    UNION ALL

    SELECT wdf.*, NULL::uuid AS active_delegate_id
    FROM with_dispatcher_flag wdf
    WHERE wdf.approver_is_dispatcher = false
  )
  SELECT
    wd.step_idx AS step_order,
    wd.approver_id AS template_approver_id,
    pt.full_name AS template_approver_name,
    COALESCE(wd.active_delegate_id, wd.approver_id) AS effective_approver_id,
    COALESCE(pe.full_name, pt.full_name) AS effective_approver_name,
    wd.approver_is_dispatcher AS is_dispatcher,
    (wd.active_delegate_id IS NOT NULL) AS was_rewritten,
    CASE
      WHEN wd.active_delegate_id IS NOT NULL THEN 'Active delegation in effect'
      WHEN wd.approver_is_dispatcher THEN 'Dispatcher role; no delegation active'
      ELSE NULL
    END AS rewrite_reason,
    wd.action_type AS action_type,
    wd.label AS label,
    -- Warnings: things to flag for the admin
    ARRAY(
      SELECT w FROM (VALUES
        (CASE WHEN wd.approver_id IS NULL THEN 'Step has no approver assigned' END),
        (CASE WHEN pt.user_id IS NULL AND wd.approver_id IS NOT NULL THEN 'Approver user_id does not match any active profile' END),
        (CASE WHEN pt.is_active = false THEN 'Approver profile is inactive' END)
      ) AS warns(w)
      WHERE w IS NOT NULL
    ) AS warnings
  FROM with_delegation wd
  LEFT JOIN public.profiles pt ON pt.user_id = wd.approver_id
  LEFT JOIN public.profiles pe ON pe.user_id = wd.active_delegate_id
  ORDER BY wd.step_idx;
END;
$$;

COMMENT ON FUNCTION public.simulate_workflow_chain IS
  'Admin-only: returns the approval chain that would be created for a memo using the given template. Mirrors submit-memo logic without persisting.';


-- ---------------------------------------------------------------------
-- 3) Permission resource for the new admin page
-- ---------------------------------------------------------------------
INSERT INTO public.permission_resources (resource_key, label, category, description, sort_order)
VALUES
  ('admin/workflow-preview', 'Workflow Chain Preview', 'page',
     'Admin tool: simulate what approval chain a workflow template would generate', 18)
ON CONFLICT (resource_key) DO NOTHING;
