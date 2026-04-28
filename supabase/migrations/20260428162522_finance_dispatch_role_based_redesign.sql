-- =====================================================================
-- Finance Dispatch — Redesign: role-based dispatcher detection
--
-- Background
-- ==========
-- The original implementation required creators to pick one of three
-- preset templates ("Finance — AP Route" / "AR Route" / "Budget Route")
-- to trigger dispatch behavior. The route_tag was structural metadata.
--
-- New behavior
-- ============
-- Dispatcher behavior is now triggered AT RUNTIME by the approver
-- holding the finance_dispatcher role, not by a template flag.
-- Whenever any approval step's approver is a dispatcher, that step
-- automatically becomes a dispatch step.
--
-- Implications:
--   - Creators can put Mohammed into a free-form workflow and dispatch
--     behavior fires automatically.
--   - Admins can build their own preset templates that include Mohammed
--     and dispatch behavior fires automatically.
--   - The three preset templates I seeded earlier are deleted (they
--     forced an unnecessary three-way split that didn't reflect actual
--     usage — Mohammed has full discretion over reviewers anyway).
--
-- This migration
-- ==============
-- 1. Deletes the three workflow_templates rows seeded by
--    20260428111511_finance_dispatch_routing_foundation.sql.
-- 2. Adds a SECURITY DEFINER helper user_is_finance_dispatcher() so
--    the submit-memo edge function can check role membership without
--    RLS recursion.
--
-- This migration is idempotent.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1) Delete the three preset templates (idempotent)
-- ---------------------------------------------------------------------
DELETE FROM public.workflow_templates
WHERE name IN (
  'Finance — AP Route',
  'Finance — AR Route',
  'Finance — Budget Route'
);

-- Note on already-submitted memos:
-- ---------------------------------
-- Memos already in flight that referenced these templates have a
-- foreign key reference (memos.workflow_template_id). Because the
-- column is nullable (it's a "remember which template was used"
-- pointer, not a structural dependency), the row stays valid even
-- when the template is gone. The memo's approval_steps already exist
-- and are unaffected — workflow_templates is only consulted at
-- submission time. After this migration, in-flight memos that used
-- one of these templates will simply have a dangling
-- workflow_template_id that resolves to NULL on JOIN. The frontend
-- handles that gracefully (treats it as no-template-info).

-- ---------------------------------------------------------------------
-- 2) Helper function: is this user the finance dispatcher?
-- ---------------------------------------------------------------------
-- Used by the submit-memo edge function (and frontend code paths) to
-- detect dispatch steps without bypassing RLS or relying on a template
-- flag. SECURITY DEFINER avoids recursion if called from RLS.
--
-- Note: this is a per-user check (true if the user has the role),
-- DIFFERENT from effective_finance_dispatcher() which returns the
-- single canonical user-id who should currently receive dispatch
-- assignments (honoring delegation windows). Both functions coexist.

CREATE OR REPLACE FUNCTION public.user_is_finance_dispatcher(_user_id uuid)
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
      AND role = 'finance_dispatcher'
  );
$$;

COMMENT ON FUNCTION public.user_is_finance_dispatcher IS
  'Returns true if the given user holds the finance_dispatcher role. Used by submit-memo to mark approval steps as dispatch steps when the approver is a dispatcher. SECURITY DEFINER avoids RLS recursion.';
