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

## Permission Model (5-step evaluation)
1. Admin → full access
2. Same department → view all, edit drafts, manage draft attachments, see audit
3. Explicitly assigned (workflow/copies-to/recipient)
4. Cross-department rule match
5. Delegate → inherited from principal
6. No access

## Cross-Department Rules
- Table: `cross_department_rules` (viewer_department_id, source_department_ids[], memo_type_filter[], access_level, scope)
- 4 seeded defaults: Finance→payments, GM→all, Legal head→action+request, HR→announcements
- Admin UI: /admin/cross-dept-rules

## Version History
- Table: `memo_versions` (memo_id, version_number, changed_by_user_id, changes, previous_values, ip_address)
- Displayed in MemoView under "Version History" tab

## Memo List Sections
- My Department (same dept memos)
- Assigned to Me (workflow/recipient from other depts)
- Cross-Department Visibility (via rules)
- Visibility badges: 🏢 Dept Only, 🏢+FIN Dept+Finance, 🌐 Company-Wide, 👥 Custom

## Department Codes
- IT, FIN, BDCR, OFM, LEG, HR, GM
