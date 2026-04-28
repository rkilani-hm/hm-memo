-- =====================================================================
-- URGENT FIX: drop recursive RLS policies introduced by commit 1657b58
--
-- Symptom: "infinite recursion detected in policy for relation 'memos'"
-- Caused by policies I added in 20260428111511_finance_dispatch_routing_foundation
-- which queried approval_steps directly from memos RLS, triggering a
-- cycle: memos → approval_steps → cross_dept_policy → memos → ...
--
-- The codebase ALREADY has SECURITY DEFINER helpers for exactly this
-- pattern (is_approver_for_memo() introduced in 2026-03-10) which
-- bypass RLS via the SECURITY DEFINER attribute. My commit 1 ignored
-- those helpers and re-created the broken pattern.
--
-- Even worse: my "Reviewers read memos they have steps on" policy is
-- functionally a DUPLICATE of the existing "Approvers view assigned
-- memos" policy — both grant access when you're an approver. So
-- dropping mine loses NO functionality — the existing safe policy
-- continues to provide the same access.
--
-- Same applies to "Reviewers read attachments of memos they review"
-- versus the existing memo_attachments cross-policy.
--
-- "Dispatcher views child reviewer steps" — the existing
-- "View own approval steps" already grants approvers (including
-- Mohammed acting on his dispatch step) access to their step. The
-- only thing this dispatcher policy adds is letting Mohammed see his
-- CHILDREN's reviewer steps directly. We replace it with a SECURITY
-- DEFINER helper to avoid recursion while preserving the access.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1) Drop the recursive policies on memos and memo_attachments
-- ---------------------------------------------------------------------

DROP POLICY IF EXISTS "Reviewers read memos they have steps on" ON public.memos;
DROP POLICY IF EXISTS "Reviewers read attachments of memos they review" ON public.memo_attachments;

-- The existing safer policies remain in place and provide equivalent
-- access:
--   - "Approvers view assigned memos" on memos      (uses is_approver_for_memo)
--   - "View attachments for accessible memos" on memo_attachments
--     (uses memos sub-query, which itself uses safe policies)


-- ---------------------------------------------------------------------
-- 2) Replace the dispatcher-views-children policy with a SECURITY
--    DEFINER variant that doesn't recurse
-- ---------------------------------------------------------------------

DROP POLICY IF EXISTS "Dispatcher views child reviewer steps" ON public.approval_steps;

CREATE OR REPLACE FUNCTION public.is_dispatch_parent_of_step(_user_id uuid, _step_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.approval_steps child
    JOIN public.approval_steps parent
      ON parent.id = child.parent_dispatch_step_id
    WHERE child.id = _step_id
      AND parent.approver_user_id = _user_id
      AND parent.is_dispatcher = true
  );
$$;

COMMENT ON FUNCTION public.is_dispatch_parent_of_step IS
  'Returns true if _user_id authored the dispatch step that spawned _step_id. SECURITY DEFINER avoids RLS recursion.';

CREATE POLICY "Dispatcher views child reviewer steps"
  ON public.approval_steps
  FOR SELECT
  TO authenticated
  USING (public.is_dispatch_parent_of_step(auth.uid(), id));


-- ---------------------------------------------------------------------
-- 3) Sanity: re-confirm has_role still in place (was potentially
--    affected by today's earlier repair migration; this is a no-op
--    if it's already correct)
-- ---------------------------------------------------------------------

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
