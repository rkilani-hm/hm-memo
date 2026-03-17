# Al Hamra Memo Platform - Design & Architecture
Updated: now

## Design System
- Primary: Navy blue HSL(213, 52%, 23%) = #1B3A5C
- Accent: Gold HSL(38, 66%, 48%) = #C8952E
- Font: Century Gothic with Libre Franklin fallback
- Corporate, clean, professional aesthetic
- Signing method badges: 🔐 Blue (Digital), 📄 Amber (Manual Paper)

## Architecture
- Auth: Supabase Auth, signup disabled (admin-only user creation)
- Roles stored in `user_roles` table (admin, department_head, staff, approver)
- `has_role()` security definer function for RLS
- `is_delegate_for()` function for delegate checks
- `is_same_department()` function for dept-level access
- `has_cross_dept_access()` function for cross-dept rules
- Auto-profile creation via trigger on auth.users insert
- Transmittal numbers: `HM/{DEPT}-IM/{SEQ}/{YEAR}` via `get_next_transmittal_no()`
- 7 departments seeded with fixed UUIDs
- Storage buckets: `attachments` (private), `signatures` (private)
- Auto-logout after 30 min inactivity

## 4-Level Approval Workflow (v8)
- Implemented as workflow template (not hardcoded)
- stage_level column on approval_steps: L1, L2a, L2b, L3, L4
- revision_count column on memos: incremented on resubmit
- L1: Department Manager (signature)
- L2a: Finance Staff dual-initials (parallel_group)
- L2b: Finance Manager (signature)
- L3: Senior Executive - any one of GM/COO/CAO/CFO (signature)
- L4: CEO/Chairman (signature, final)
- WorkflowTracker shows stage labels, days pending, parallel group progress
- PDF: 3-column approvals block (Finance | Executive | CEO) when stages present
- PDF: QR code in footer for physical verification
- PendingApprovals: Days Pending column with amber (2d) / red (5d) coloring

## Permission Model (5-step evaluation)
1. Admin → full access
2. Same department → view all, edit drafts, manage draft attachments, see audit
3. Explicitly assigned (workflow/copies-to/recipient)
4. Cross-department rule match
5. Delegate → inherited from principal
6. No access

## Department Codes
- IT, FIN, BDCR, OFM, LEG, HR, GM
