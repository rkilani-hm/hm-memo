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
- Auto-profile creation via trigger on auth.users insert
- Transmittal numbers: `HM/{DEPT}-IM/{SEQ}/{YEAR}` via `get_next_transmittal_no()`
- 7 departments seeded with fixed UUIDs
- Storage buckets: `attachments` (private), `signatures` (private)
- Auto-logout after 30 min inactivity

## v3 Features
- delegate_assignments table: delegate_user_id, principal_user_id, is_active
- approval_steps: signing_method, registered_by_user_id, date_of_physical_signing, scan_attachment_url, registration_notes
- audit_log: ip_address, ip_geolocation_city/country, user_agent_raw, device_type, browser, os, on_behalf_of_user_id/name, signing_method, action_detail, transmittal_no
- Admin pages: /admin/delegates, /admin/audit-log
- ManualRegistrationPanel component for delegate paper signing
- AuditTrailTab component for per-memo audit timeline
- collectDeviceInfo() in src/lib/device-info.ts

## Department Codes
- IT, FIN, BDCR, OFM, LEG, HR, GM
