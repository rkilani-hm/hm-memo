# Memory: index.md
Updated: now

# Al Hamra Memo Platform - Design & Architecture

## Design System
- Primary: Navy blue HSL(213, 52%, 23%) = #1B3A5C
- Accent: Gold HSL(38, 66%, 48%) = #C8952E
- Font: Century Gothic with Libre Franklin fallback
- Corporate, clean, professional aesthetic

## Architecture
- Auth: Supabase Auth, signup disabled (admin-only user creation)
- Roles stored in `user_roles` table (admin, department_head, staff, approver)
- `has_role()` security definer function for RLS
- Auto-profile creation via trigger on auth.users insert
- Transmittal numbers: `HM/{DEPT}-IM/{SEQ}/{YEAR}` via `get_next_transmittal_no()`
- 7 departments seeded with fixed UUIDs (d1000000-...-000000000001 through 007)
- Storage buckets: `attachments` (private), `signatures` (private, user-scoped)
- Auto-logout after 30 min inactivity

## Department Codes
- IT, FIN, BDCR, OFM, LEG, HR, GM

## Workflow System (v2)
- 4 step action types: signature, initial, review, acknowledge (enum `step_action_type`)
- Dual signing assets: `signature_image_url` + `initials_image_url` on profiles
- approval_steps has: action_type, parallel_group, is_required, deadline
- Two workflow modes: Preset (template dropdown) and Dynamic (card builder)
- Dynamic workflows can be saved as templates
- Parallel steps share same `parallel_group` number
- submit-memo edge function handles both custom_steps and template-based workflows
- WorkflowBuilder component replaces WorkflowPreview
