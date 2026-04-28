-- =====================================================================
-- Finance dispatch routing — Schema foundation
-- =====================================================================

ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'finance_dispatcher';
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'finance_manager';
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'ap_accountant';
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'ar_accountant';
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'budget_controller';

ALTER TABLE public.approval_steps
  ADD COLUMN IF NOT EXISTS is_dispatcher           boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS parent_dispatch_step_id uuid REFERENCES public.approval_steps(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS dispatched_to_user_ids  uuid[],
  ADD COLUMN IF NOT EXISTS dispatched_at           timestamptz,
  ADD COLUMN IF NOT EXISTS dispatched_notes        text,
  ADD COLUMN IF NOT EXISTS signer_roles_at_signing jsonb;

COMMENT ON COLUMN public.approval_steps.is_dispatcher IS
  'True when this step is a dispatch step. The approver picks reviewers at runtime instead of approving directly.';
COMMENT ON COLUMN public.approval_steps.parent_dispatch_step_id IS
  'For reviewer steps: the dispatch step that spawned this one. Null for non-reviewer steps.';
COMMENT ON COLUMN public.approval_steps.dispatched_to_user_ids IS
  'Snapshot of the reviewer user IDs picked when this dispatch step was completed.';
COMMENT ON COLUMN public.approval_steps.signer_roles_at_signing IS
  'JSON array of role strings held by the signer at the moment they signed. Used by PDF renderer for stable attribution.';

CREATE INDEX IF NOT EXISTS idx_approval_steps_parent_dispatch
  ON public.approval_steps (parent_dispatch_step_id)
  WHERE parent_dispatch_step_id IS NOT NULL;

ALTER TABLE public.approval_steps
  DROP CONSTRAINT IF EXISTS approval_steps_dispatch_no_nesting;
ALTER TABLE public.approval_steps
  ADD CONSTRAINT approval_steps_dispatch_no_nesting CHECK (
    NOT (is_dispatcher = true AND parent_dispatch_step_id IS NOT NULL)
  );

ALTER TABLE public.delegate_assignments
  ADD COLUMN IF NOT EXISTS valid_from timestamptz,
  ADD COLUMN IF NOT EXISTS valid_to   timestamptz,
  ADD COLUMN IF NOT EXISTS scope      text NOT NULL DEFAULT 'general'
    CHECK (scope IN ('general', 'finance_dispatcher'));

COMMENT ON COLUMN public.delegate_assignments.valid_from IS
  'Start of the delegation window. Null = effective immediately on assignment.';
COMMENT ON COLUMN public.delegate_assignments.valid_to IS
  'End of the delegation window. Null = open-ended (existing behavior).';
COMMENT ON COLUMN public.delegate_assignments.scope IS
  'Domain of the delegation. ''general'' = full delegation (existing). ''finance_dispatcher'' = only the finance dispatch role is delegated.';

CREATE INDEX IF NOT EXISTS idx_delegate_assignments_scope_window
  ON public.delegate_assignments (principal_user_id, scope, valid_from, valid_to)
  WHERE is_active = true AND revoked_at IS NULL;

CREATE OR REPLACE FUNCTION public.effective_finance_dispatcher()
RETURNS uuid
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _principal uuid;
  _delegate  uuid;
  _now       timestamptz := now();
BEGIN
  SELECT ur.user_id INTO _principal
  FROM public.user_roles ur
  JOIN public.profiles p ON p.user_id = ur.user_id
  WHERE ur.role = 'finance_dispatcher'
    AND p.is_active = true
  ORDER BY ur.id ASC
  LIMIT 1;

  IF _principal IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT da.delegate_user_id INTO _delegate
  FROM public.delegate_assignments da
  WHERE da.principal_user_id = _principal
    AND da.scope = 'finance_dispatcher'
    AND da.is_active = true
    AND da.revoked_at IS NULL
    AND (da.valid_from IS NULL OR da.valid_from <= _now)
    AND (da.valid_to   IS NULL OR da.valid_to   >= _now)
  ORDER BY da.created_at DESC
  LIMIT 1;

  RETURN COALESCE(_delegate, _principal);
END;
$$;

COMMENT ON FUNCTION public.effective_finance_dispatcher IS
  'Returns the user_id who currently fills the finance dispatcher role, honoring active time-bounded delegations.';

DROP POLICY IF EXISTS "Dispatcher views child reviewer steps" ON public.approval_steps;
CREATE POLICY "Dispatcher views child reviewer steps"
  ON public.approval_steps
  FOR SELECT
  TO authenticated
  USING (
    parent_dispatch_step_id IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM public.approval_steps parent
      WHERE parent.id = parent_dispatch_step_id
        AND parent.approver_user_id = auth.uid()
        AND parent.is_dispatcher = true
    )
  );

DROP POLICY IF EXISTS "Reviewers read memos they have steps on" ON public.memos;
CREATE POLICY "Reviewers read memos they have steps on"
  ON public.memos
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.approval_steps s
      WHERE s.memo_id = id
        AND s.approver_user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Reviewers read attachments of memos they review" ON public.memo_attachments;
CREATE POLICY "Reviewers read attachments of memos they review"
  ON public.memo_attachments
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.approval_steps s
      WHERE s.memo_id = memo_attachments.memo_id
        AND s.approver_user_id = auth.uid()
    )
  );

INSERT INTO public.permission_resources (resource_key, label, category, description, sort_order)
VALUES
  ('finance/dispatch', 'Finance — Dispatch Queue', 'page',
   'Mohammed-only queue showing memos awaiting reviewer assignment via the new finance routes', 51)
ON CONFLICT (resource_key) DO NOTHING;

INSERT INTO public.workflow_templates (id, name, memo_type, is_default, steps, pdf_layout)
VALUES
  (
    gen_random_uuid(),
    'Finance — AP Route',
    'payments',
    false,
    jsonb_build_array(
      jsonb_build_object(
        'label',                'Finance Assistant Manager — Dispatch',
        'action_type',          'review',
        'is_required',          true,
        'parallel_group',        null,
        'deadline',              null,
        'stage_level',          'finance',
        'is_dispatcher',         true,
        'dispatcher_pool_role', 'finance_dispatcher',
        'route_tag',            'AP'
      )
    ),
    jsonb_build_object('finance_route', 'AP', 'description', 'Memos requiring AP accountant initials')
  ),
  (
    gen_random_uuid(),
    'Finance — AR Route',
    'payments',
    false,
    jsonb_build_array(
      jsonb_build_object(
        'label',                'Finance Assistant Manager — Dispatch',
        'action_type',          'review',
        'is_required',          true,
        'parallel_group',        null,
        'deadline',              null,
        'stage_level',          'finance',
        'is_dispatcher',         true,
        'dispatcher_pool_role', 'finance_dispatcher',
        'route_tag',            'AR'
      )
    ),
    jsonb_build_object('finance_route', 'AR', 'description', 'Memos requiring AR accountant initials')
  ),
  (
    gen_random_uuid(),
    'Finance — Budget Route',
    'payments',
    false,
    jsonb_build_array(
      jsonb_build_object(
        'label',                'Finance Assistant Manager — Dispatch',
        'action_type',          'review',
        'is_required',          true,
        'parallel_group',        null,
        'deadline',              null,
        'stage_level',          'finance',
        'is_dispatcher',         true,
        'dispatcher_pool_role', 'finance_dispatcher',
        'route_tag',            'Budget'
      )
    ),
    jsonb_build_object('finance_route', 'Budget', 'description', 'Memos requiring Budget Controller initials')
  )
ON CONFLICT DO NOTHING;