// =====================================================================
// Finance-dispatch column bucketing
// =====================================================================
//
// Single source of truth for "which approval steps go in which column"
// of the three-column finance signature grid.
//
//   Column A = Finance (reviewers → dispatcher → finance manager)
//   Column B = General Manager
//   Column C = CEO / Chairman
//
// Used by:
//   - src/lib/memo-pdf-html.ts (PDF + print preview rendering)
//   - src/pages/MemoView.tsx   (in-page approvals grid)
//
// Both renderers call bucketStepsForFinanceGrid() to get the same
// answer and then format the buckets into their respective output
// (HTML strings for PDF, React JSX for the in-page view).
//
// Detection and ordering are PURELY ROLE-DRIVEN:
//   - signer_roles_at_signing snapshot is the authoritative source for
//     SIGNED steps (immutable, immune to future role changes).
//   - userRolesByUserId is the authoritative source for PENDING steps
//     (live lookup at render time).
//   - Job titles are NEVER used for routing — they are display-only.
//
// =====================================================================

import type { Tables } from '@/integrations/supabase/types';

type ApprovalStep = Tables<'approval_steps'>;

export const FINANCE_REVIEWER_ROLES = [
  'finance_dispatcher',
  'finance_manager',
  'ap_accountant',
  'ar_accountant',
  'budget_controller',
  'finance', // legacy role kept for older signed steps
] as const;

export const GM_ROLES = ['gm', 'general_manager'] as const;
export const CEO_ROLES = ['ceo', 'chairman'] as const;

/**
 * Returns the effective roles for a step.
 *   - SIGNED step → uses signer_roles_at_signing snapshot (stable forever).
 *   - PENDING step → uses userRolesByUserId (live lookup).
 * Never falls back to job_title.
 */
export function effectiveRolesForStep(
  step: ApprovalStep,
  userRolesByUserId: Record<string, string[]>,
): string[] {
  const snapshot = ((step as any).signer_roles_at_signing as string[] | null) || [];
  if (snapshot.length > 0) return snapshot;
  const approverId = step.approver_user_id;
  if (!approverId) return [];
  return userRolesByUserId[approverId] || [];
}

/**
 * True if any step in the chain belongs to the finance-dispatch flow.
 *   - is_dispatcher flag set OR
 *   - parent_dispatch_step_id set (spawned by dispatch) OR
 *   - signer_roles_at_signing has a finance role OR
 *   - approver currently holds a finance role
 */
export function memoUsesFinanceDispatch(
  steps: ApprovalStep[],
  userRolesByUserId: Record<string, string[]>,
): boolean {
  return steps.some((s) => {
    if ((s as any).is_dispatcher === true) return true;
    if ((s as any).parent_dispatch_step_id) return true;
    const snapshot = ((s as any).signer_roles_at_signing as string[] | null) || [];
    if (snapshot.some((r) => (FINANCE_REVIEWER_ROLES as readonly string[]).includes(r))) {
      return true;
    }
    const liveRoles = s.approver_user_id
      ? (userRolesByUserId[s.approver_user_id] || [])
      : [];
    return liveRoles.some((r) => (FINANCE_REVIEWER_ROLES as readonly string[]).includes(r));
  });
}

/** Classify a step into A (finance) / B (GM) / C (CEO) / null (skip). */
export function classifyStepColumn(
  step: ApprovalStep,
  userRolesByUserId: Record<string, string[]>,
): 'A' | 'B' | 'C' | null {
  // Dispatch routing events never print
  if ((step as any).is_dispatcher === true) return null;

  const roles = effectiveRolesForStep(step, userRolesByUserId);

  if (roles.some((r) => (FINANCE_REVIEWER_ROLES as readonly string[]).includes(r))) return 'A';
  if (roles.some((r) => (GM_ROLES as readonly string[]).includes(r))) return 'B';
  if (roles.some((r) => (CEO_ROLES as readonly string[]).includes(r))) return 'C';

  return null;
}

/**
 * Role hierarchy rank within Column A.
 *   1 = Reviewers (AP/AR/Budget/legacy 'finance')
 *   2 = Dispatcher (finance_dispatcher)
 *   3 = Finance Manager (finance_manager)
 *   4 = unknown (sorts to end)
 */
export function financeRoleRank(
  step: ApprovalStep,
  userRolesByUserId: Record<string, string[]>,
): number {
  const roles = effectiveRolesForStep(step, userRolesByUserId);

  // Most senior wins (in case a user holds multiple roles)
  if (roles.includes('finance_manager')) return 3;
  if (roles.includes('finance_dispatcher')) return 2;
  if (
    roles.includes('ap_accountant') ||
    roles.includes('ar_accountant') ||
    roles.includes('budget_controller') ||
    roles.includes('finance')
  ) {
    return 1;
  }
  return 4;
}

/**
 * Friendly display label for the role line under a finance signer's name.
 */
export function financeRoleLabel(roles: string[] | null): string {
  if (!roles || roles.length === 0) return 'Finance';
  if (roles.includes('finance_manager')) return 'Finance Manager';
  if (roles.includes('finance_dispatcher')) return 'Finance Asst. Manager';
  if (roles.includes('ap_accountant')) return 'AP Accountant';
  if (roles.includes('ar_accountant')) return 'AR Accountant';
  if (roles.includes('budget_controller')) return 'Budget Controller';
  if (roles.includes('finance')) return 'Finance';
  return 'Finance';
}

export interface FinanceColumnBuckets {
  colA: ApprovalStep[]; // finance team, sorted reviewers → dispatcher → manager
  colB: ApprovalStep | undefined; // GM (first one if multiple)
  colC: ApprovalStep | undefined; // CEO/Chairman (first one if multiple)
}

/**
 * Bucket all steps into the three columns. The single source of truth
 * used by both the PDF and in-page renderers.
 */
export function bucketStepsForFinanceGrid(
  steps: ApprovalStep[],
  userRolesByUserId: Record<string, string[]>,
): FinanceColumnBuckets {
  const colA: ApprovalStep[] = [];
  let colB: ApprovalStep | undefined;
  let colC: ApprovalStep | undefined;

  for (const s of steps) {
    const cls = classifyStepColumn(s, userRolesByUserId);
    if (cls === 'A') colA.push(s);
    else if (cls === 'B' && !colB) colB = s;
    else if (cls === 'C' && !colC) colC = s;
  }

  // Sort column A by role hierarchy (ties broken by step_order)
  colA.sort((a, b) => {
    const aRank = financeRoleRank(a, userRolesByUserId);
    const bRank = financeRoleRank(b, userRolesByUserId);
    if (aRank !== bRank) return aRank - bRank;
    return (a.step_order || 0) - (b.step_order || 0);
  });

  return { colA, colB, colC };
}
