-- =====================================================================
-- Finance dispatch routing — Schema foundation
--
-- This migration adds the data model for the new finance approval flow
-- (the "three universal finance routes" — AP, AR, Budget) but does NOT
-- change any existing behavior. Existing workflows continue to work
-- unchanged. This is the foundation; the workflow engine code, dispatch
-- UI, and PDF renderer changes will follow in separate commits.
--
-- Concepts introduced
-- ===================
-- 1. Dispatch step — an approval step where the approver (Mohammed, the
--    Finance Assistant Manager, who holds the finance_dispatcher role)
--    picks a SET of reviewers at runtime. Modelled as a normal step with
--    is_dispatcher = true.
--
-- 2. Reviewer step — an approval step spawned by a dispatch step at the
--    moment Mohammed clicks "Dispatch." Has parent_dispatch_step_id
--    pointing back to its dispatch parent. Reviewer steps within the
--    same dispatch share a parallel_group so the workflow engine knows
--    they run concurrently.
--
-- 3. Time-bounded delegation — Mohammed manually picks a delegate for a
--    date range (from / to). During the window, the delegate temporarily
--    acts as the dispatcher.
--
-- 4. Role snapshot — every signed approval_step captures the signer's
--    roles AT SIGNING TIME so the PDF renderer always shows correct
--    historical attribution even if roles are reassigned later.
--
-- Coexistence
-- ===========
-- Old workflow templates (where creators handpick finance staff) keep
-- working untouched. Three new templates (Finance — AP, AR, Budget) are
-- seeded by this migration. Admins and creators can pick either path.
-- =====================================================================


-- ---------------------------------------------------------------------
-- 1) Extend app_role enum with finance team roles
-- ---------------------------------------------------------------------
-- Existing values: admin | department_head | staff | approver | finance
-- (the 'finance' value was added by 20260427132536_finance_role_and_payment_handoff.sql)
--
-- New values added here:
--   finance_dispatcher  — Mohammed; the only role that can dispatch
--   finance_manager     — final approver after the dispatch + sign-off cycle
--   ap_accountant       — reviewer pool member
--   ar_accountant       — reviewer pool member
--   budget_controller   — reviewer pool member

ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'finance_dispatcher';
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'finance_manager';
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'ap_accountant';
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'ar_accountant';
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'budget_controller';


-- ---------------------------------------------------------------------
-- 2) Approval-step columns for dispatch / reviewer relationship
-- ---------------------------------------------------------------------
-- is_dispatcher
--   true when this step is the dispatch step (Mohammed picks reviewers).
--   At runtime, the engine knows to render the dispatch UI instead of
--   a normal approve/reject UI.
--
-- parent_dispatch_step_id
--   non-null on reviewer steps. References the dispatch step that
--   spawned them. ON DELETE CASCADE — if the dispatch step is deleted,
--   so are its children. (Should never happen in practice; safety net.)
--
-- dispatched_to_user_ids
--   On the dispatch step itself, snapshot of the user IDs Mohammed
--   picked at the moment of dispatch. Useful for audit/reporting even
--   if individual reviewer steps are later edited.
--
-- dispatched_at, dispatched_notes
--   Captured at the moment Mohammed clicks "Dispatch."
--
-- signer_roles_at_signing
--   JSONB array of role strings the user held when they signed. Stable
--   forever. The PDF renderer reads this to know which column on the
--   signature grid the signature belongs to (Column A = finance =
--   anyone with one of finance_dispatcher / ap_accountant /
--   ar_accountant / budget_controller).

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

-- Sanity constraints:
--   A dispatch step CANNOT have a parent_dispatch_step_id (no nested dispatches).
--   A reviewer step (parent_dispatch_step_id NOT NULL) CANNOT itself be is_dispatcher.
ALTER TABLE public.approval_steps
  DROP CONSTRAINT IF EXISTS approval_steps_dispatch_no_nesting;
ALTER TABLE public.approval_steps
  ADD CONSTRAINT approval_steps_dispatch_no_nesting CHECK (
    NOT (is_dispatcher = true AND parent_dispatch_step_id IS NOT NULL)
  );


-- ---------------------------------------------------------------------
-- 3) Time-bounded delegation columns on delegate_assignments
-- ---------------------------------------------------------------------
-- Existing delegate_assignments has is_active and revoked_at. We add:
--   valid_from, valid_to — explicit calendar window
--   scope               — 'general' (existing behavior) | 'finance_dispatcher'
--                         (new, used for Mohammed's manual dispatcher
--                          delegations during leave)
--
-- Existing delegations get scope='general' implicitly (default), so they
-- continue to behave as before. New finance-dispatcher delegations carry
-- scope='finance_dispatcher' and a calendar window.

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


-- ---------------------------------------------------------------------
-- 4) Helper function: who is the effective dispatcher right now?
-- ---------------------------------------------------------------------
-- Returns the user ID that should receive a dispatch step at this
-- moment. Honors active time-bounded delegations.
--
-- Logic:
--   1. Look at the principal (the user with finance_dispatcher role
--      who would normally receive dispatch steps — Mohammed in
--      practice).
--   2. Check delegate_assignments for an active, in-window delegation
--      with scope = 'finance_dispatcher'.
--   3. If a delegation is active, return the delegate's user_id.
--      Otherwise return the principal.
--
-- Returns NULL if no user holds the finance_dispatcher role at all
-- (caller should treat this as a configuration error).

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
  -- Find the canonical dispatcher (any active user with the role)
  SELECT ur.user_id INTO _principal
  FROM public.user_roles ur
  JOIN public.profiles p ON p.user_id = ur.user_id
  WHERE ur.role = 'finance_dispatcher'
    AND p.is_active = true
  ORDER BY ur.created_at ASC
  LIMIT 1;

  IF _principal IS NULL THEN
    RETURN NULL;
  END IF;

  -- Check for an active in-window finance-dispatcher delegation
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


-- ---------------------------------------------------------------------
-- 5) RLS — let finance team members see relevant approval steps
-- ---------------------------------------------------------------------
-- Reviewer steps spawned by a dispatch belong to memos the reviewer
-- might not otherwise have access to (e.g. a memo from Procurement
-- that an AP accountant has never been assigned to before). RLS needs
-- to allow them to see:
--   - Their own reviewer_step rows (they're the approver_user_id, so
--     existing approver-self policy already covers them).
--   - The memo + attachments of any memo they have a reviewer step on
--     (so they can read context to make their initial decision).
--
-- The dispatcher (Mohammed) needs to see all reviewer steps under any
-- dispatch step he authored, even if he's not directly on those
-- reviewer steps.

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

-- Reviewers need to read the parent memo to provide context for their
-- review decision. Reuse the existing pattern.
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


-- ---------------------------------------------------------------------
-- 6) Permission catalog — register the new templates as configurable
-- ---------------------------------------------------------------------
INSERT INTO public.permission_resources (resource_key, label, category, description, sort_order)
VALUES
  ('finance/dispatch', 'Finance — Dispatch Queue', 'page',
   'Mohammed-only queue showing memos awaiting reviewer assignment via the new finance routes', 51)
ON CONFLICT (resource_key) DO NOTHING;


-- ---------------------------------------------------------------------
-- 7) Seed the three finance route workflow templates
-- ---------------------------------------------------------------------
-- Each template's `steps` JSONB encodes a single "dispatch" step with
-- is_dispatcher=true. Mohammed (the principal, looked up via the
-- finance_dispatcher role at memo creation time) is the approver. At
-- runtime, when he completes the dispatch, the application code spawns
-- reviewer steps based on his picks; those reviewer steps are NOT in
-- the template — they're dynamic.
--
-- The Department Head approval and Finance Manager approval are NOT in
-- these templates either. The Department Head step is automatically
-- prepended for any memo (existing behavior). The Finance Manager step
-- is added by the workflow engine after the dispatch + sign-off cycle
-- completes.
--
-- Why is this template so minimal? Because the surrounding pieces
-- (Dept Head, Finance Manager, optional GM/CEO escalation) are
-- standard. The ONLY thing that varies per route is the dispatch step
-- itself, and the variation is just labeling and routing tags.
--
-- The `pdf_layout` column captures route-specific PDF metadata (route
-- tag), which the renderer uses for the column-A finance grouping.

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
